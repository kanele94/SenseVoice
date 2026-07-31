# Set the device with environment, default is cuda:0
# export SENSEVOICE_DEVICE=cuda:1

import os, re
import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing_extensions import Annotated
from typing import List, Optional
from urllib.parse import urlparse, unquote
from enum import Enum
import torchaudio
from model import SenseVoiceSmall
from funasr.utils.postprocess_utils import rich_transcription_postprocess
from io import BytesIO

TARGET_FS = 16000
# Limits for fetching caller-supplied URLs: a remote host must not be able to hang
# a worker forever or stream an unbounded body into memory.
DOWNLOAD_TIMEOUT_S = float(os.getenv("SENSEVOICE_DOWNLOAD_TIMEOUT", "30"))
MAX_DOWNLOAD_BYTES = int(os.getenv("SENSEVOICE_MAX_DOWNLOAD_MB", "100")) * 1024 * 1024


class Language(str, Enum):
    auto = "auto"
    zh = "zh"
    en = "en"
    yue = "yue"
    ja = "ja"
    ko = "ko"
    nospeech = "nospeech"


model_dir = "iic/SenseVoiceSmall"
m, kwargs = SenseVoiceSmall.from_pretrained(model=model_dir, device=os.getenv("SENSEVOICE_DEVICE", "cuda:0"))
m.eval()

regex = r"<\|.*\|>"

app = FastAPI()

# The web UI lets users point their browser at any deployment of this API,
# so cross-origin requests must be allowed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset=utf-8>
            <title>Api information</title>
        </head>
        <body>
            <a href='./docs'>Documents of API</a>
        </body>
    </html>
    """


class AsrUrlRequest(BaseModel):
    audio_urls: Annotated[List[str], Field(description="http(s) URLs of wav or mp3 audios", min_length=1)]
    keys: Annotated[Optional[str], Field(description="name of each audio joined with comma")] = None
    lang: Annotated[Language, Field(description="language of audio content")] = Language.auto
    use_itn: Annotated[bool, Field(description="apply inverse text normalization")] = False


def decode_audio(raw: bytes):
    """Decode encoded audio bytes into a mono waveform at TARGET_FS."""
    waveform, audio_fs = torchaudio.load(BytesIO(raw))

    # transform to target sample
    if audio_fs != TARGET_FS:
        resampler = torchaudio.transforms.Resample(orig_freq=audio_fs, new_freq=TARGET_FS)
        waveform = resampler(waveform)

    return waveform.mean(0)


def transcribe(audios, key, lang, use_itn):
    if lang == "":
        lang = "auto"

    res = m.inference(
        data_in=audios,
        language=lang,  # "zh", "en", "yue", "ja", "ko", "nospeech"
        use_itn=use_itn,
        ban_emo_unk=False,
        key=key,
        fs=TARGET_FS,
        **kwargs,
    )
    if len(res) == 0:
        return {"result": []}
    for it in res[0]:
        it["raw_text"] = it["text"]
        it["clean_text"] = re.sub(regex, "", it["text"], 0, re.MULTILINE)
        it["text"] = rich_transcription_postprocess(it["text"])
    return {"result": res[0]}


async def download_audio(client: httpx.AsyncClient, url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"unsupported URL scheme in {url!r}, expected http or https")

    try:
        async with client.stream("GET", url) as response:
            response.raise_for_status()

            # Content-Length is advisory, so also count what actually arrives.
            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > MAX_DOWNLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"audio at {url} exceeds {MAX_DOWNLOAD_BYTES} bytes")

            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_DOWNLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"audio at {url} exceeds {MAX_DOWNLOAD_BYTES} bytes")
                chunks.append(chunk)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"failed to fetch {url}: HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"failed to fetch {url}: {e}")

    return b"".join(chunks)


def key_from_url(url: str) -> str:
    """Derive a result key from a URL, ignoring the query string."""
    name = unquote(urlparse(url).path).rsplit("/", 1)[-1]
    return name or url


@app.post("/api/v1/asr")
async def turn_audio_to_text(
    files: Annotated[List[UploadFile], File(description="wav or mp3 audios in 16KHz")],
    keys: Annotated[str, Form(description="name of each audio joined with comma")] = None,
    lang: Annotated[Language, Form(description="language of audio content")] = "auto",
    use_itn: Annotated[bool, Form(description="apply inverse text normalization")] = False,
):
    audios = [decode_audio(await file.read()) for file in files]
    key = keys.split(",") if keys else [f.filename for f in files]
    return transcribe(audios, key, lang, use_itn)


@app.post("/api/v1/asr/url")
async def turn_audio_url_to_text(req: AsrUrlRequest):
    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=True) as client:
        downloads = [await download_audio(client, url) for url in req.audio_urls]

    audios = []
    for url, raw in zip(req.audio_urls, downloads):
        try:
            audios.append(decode_audio(raw))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"failed to decode audio from {url}: {e}")

    key = req.keys.split(",") if req.keys else [key_from_url(u) for u in req.audio_urls]
    return transcribe(audios, key, req.lang, req.use_itn)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=50000)
