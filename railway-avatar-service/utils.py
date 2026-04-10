"""
Utility functions for the avatar service.
"""


def format_duration(seconds: float) -> str:
    """Format seconds into human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    return f"{hours}h {mins}m"


def estimate_render_time(audio_duration_seconds: float, gpu_type: str = "a100") -> float:
    """
    Estimate render time for a given audio duration.
    Based on benchmarks:
      - A100 80GB: ~50s per 4s of video = 12.5x realtime
      - A10G 24GB: ~90s per 4s of video = 22.5x realtime
      - RTX 4090 24GB: ~70s per 4s of video = 17.5x realtime
    """
    multipliers = {
        "a100": 12.5,
        "a10g": 22.5,
        "rtx4090": 17.5,
        "v100": 30.0,
    }
    multiplier = multipliers.get(gpu_type.lower(), 20.0)
    return audio_duration_seconds * multiplier
