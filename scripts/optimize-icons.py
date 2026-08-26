from pathlib import Path
from PIL import Image

PROJECT = Path("/home/ubuntu/custom-ai-studio-mobile")
ASSETS = [
    PROJECT / "assets/images/icon.png",
    PROJECT / "assets/images/splash-icon.png",
    PROJECT / "assets/images/favicon.png",
    PROJECT / "assets/images/android-icon-foreground.png",
]
MAX_BYTES = 100_000
MAX_DIMENSION = 512


def prepare(image: Image.Image, dimension: int) -> Image.Image:
    image = image.convert("RGB")
    image.thumbnail((dimension, dimension), Image.Resampling.LANCZOS)
    return image


def save_under_limit(source: Path) -> tuple[int, int, int]:
    original = Image.open(source)
    candidates = [(512, 160), (512, 128), (512, 96), (512, 64), (480, 96), (448, 96), (416, 96), (384, 96)]
    temporary = source.with_suffix(".optimized.png")

    for dimension, colors in candidates:
        image = prepare(original, min(dimension, MAX_DIMENSION))
        indexed = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        indexed.save(temporary, format="PNG", optimize=True, compress_level=9)
        if temporary.stat().st_size < MAX_BYTES:
            temporary.replace(source)
            width, height = Image.open(source).size
            return width, height, source.stat().st_size

    temporary.unlink(missing_ok=True)
    raise RuntimeError(f"Could not reduce {source.name} below {MAX_BYTES} bytes.")


for asset in ASSETS:
    width, height, size = save_under_limit(asset)
    print(f"{asset.name}: {width}x{height}, {size} bytes")
