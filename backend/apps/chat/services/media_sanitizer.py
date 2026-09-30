"""
Contrôle et nettoyage des pièces jointes du chat.

- Vérifie le VRAI contenu du fichier (et non le nom ou le type annoncé par le
  téléphone) : une page HTML renommée en .jpg est refusée.
- Réencode les images pour supprimer les métadonnées EXIF, dont la position
  GPS prise par le téléphone (elle révélerait l'emplacement de la ferme).
- Donne un nom aléatoire au fichier : l'adresse ne peut pas être devinée.
"""

from __future__ import annotations

import io
import uuid

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError

from ..domain.exceptions import InvalidMediaFormat

MAX_IMAGE_PIXELS = 40_000_000  # ~ 40 Mpx : au-delà, image suspecte (bombe de décompression)
_IMAGE_FORMATS = {'JPEG': ('jpg', 'JPEG'), 'PNG': ('png', 'PNG'), 'WEBP': ('webp', 'WEBP'), 'MPO': ('jpg', 'JPEG')}
_VIDEO_BRANDS_EXT = {'qt  ': 'mov'}


def random_media_name(extension: str) -> str:
    return f"{uuid.uuid4().hex}.{extension.lower().lstrip('.')}"


def _sanitize_image(media_file: UploadedFile) -> ContentFile:
    media_file.seek(0)
    try:
        with Image.open(media_file) as probe:
            source_format = probe.format
            width, height = probe.size
            probe.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as err:
        raise InvalidMediaFormat("Le fichier n'est pas une image valide") from err

    if source_format not in _IMAGE_FORMATS:
        raise InvalidMediaFormat("Format d'image non pris en charge")
    if width * height > MAX_IMAGE_PIXELS:
        raise InvalidMediaFormat("Image trop grande")

    extension, save_format = _IMAGE_FORMATS[source_format]
    media_file.seek(0)
    try:
        with Image.open(media_file) as image:
            image = ImageOps.exif_transpose(image)
            if save_format == 'JPEG' and image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
            output = io.BytesIO()
            save_kwargs = {'quality': 90} if save_format in ('JPEG', 'WEBP') else {}
            # Pas de paramètre exif : les métadonnées (GPS, appareil) ne sont pas réécrites.
            image.save(output, format=save_format, **save_kwargs)
    except (OSError, ValueError, Image.DecompressionBombError) as err:
        raise InvalidMediaFormat("Le fichier n'est pas une image valide") from err
    return ContentFile(output.getvalue(), name=random_media_name(extension))


def _sanitize_video(media_file: UploadedFile) -> UploadedFile:
    media_file.seek(0)
    header = media_file.read(12)
    media_file.seek(0)
    # MP4 et MOV (ISO BMFF) : « ftyp » aux octets 4 à 8.
    if len(header) < 12 or header[4:8] != b'ftyp':
        raise InvalidMediaFormat("Le fichier n'est pas une vidéo MP4 ou MOV valide")
    brand = header[8:12].decode('latin-1')
    extension = _VIDEO_BRANDS_EXT.get(brand, 'mp4')
    media_file.name = random_media_name(extension)
    return media_file


def sanitize_media(media_file: UploadedFile, media_type: str):
    """Retourne un fichier sûr à enregistrer, ou lève InvalidMediaFormat."""
    if media_type == 'image':
        return _sanitize_image(media_file)
    if media_type == 'video':
        return _sanitize_video(media_file)
    raise InvalidMediaFormat('Type de média non pris en charge')
