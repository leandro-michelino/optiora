"""OptiOra backend package."""

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional local bootstrap helper
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

__version__ = "0.1.0"
