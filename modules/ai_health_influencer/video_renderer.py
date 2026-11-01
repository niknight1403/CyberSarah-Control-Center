import os
import subprocess
from PIL import Image, ImageDraw, ImageFont
import logging

logger = logging.getLogger("VideoRenderer")

class VideoRenderer:
    def __init__(self):
        self.output_dir = "/opt/cybersarah-control-center/logs/renders"
        os.makedirs(self.output_dir, exist_ok=True)

    def render_short(self, script_data, product_name):
        logger.info("Starte echtes Video-Rendering (FFmpeg + Pillow)...")
        
        timestamp = os.popen("date +%Y%m%d_%H%M%S").read().strip()
        image_path = f"/tmp/frame_{timestamp}.png"
        video_path = f"{self.output_dir}/short_{timestamp}.mp4"

        # 1. Erstelle ein vertikales 9:16 Bild (1080x1920) im Cyber-Design
        img = Image.new('RGB', (1080, 1920), color=(10, 10, 10))
        d = ImageDraw.Draw(img)
        
        # Text zeichnen (Hook & Body)
        # Hinweis: Nutzt Standard-Systemschrift
        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 60)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
        except:
            font_large = font_small = None

        d.text((80, 400), "CYBERSARAH HEALTH", fill=(0, 255, 102), font=font_large)
        d.text((80, 600), f"PRODUKT:\n{product_name}", fill=(255, 255, 255), font=font_small)
        d.text((80, 900), f"HOOK:\n\"{script_data.get('hook', '')}\"", fill=(255, 200, 0), font=font_small)
        d.text((80, 1300), f"CTA:\n{script_data.get('cta', '')}", fill=(0, 255, 255), font=font_small)

        img.save(image_path)

        # 2. Konvertiere das Bild mit FFmpeg in ein 15-sekündiges MP4-Short (9:16)
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", image_path,
            "-t", "15", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-vf", "scale=1080:1920", video_path
        ]
        
        subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        if os.path.exists(video_path):
            logger.info(f"[SUCCESS] Echtes Video erfolgreich gerendert: {video_path}")
            return video_path
        else:
            logger.error("Video-Rendering fehlgeschlagen.")
            return None
