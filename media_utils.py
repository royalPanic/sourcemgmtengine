import os
import shutil
import uuid


def get_media_dir():
    """Return the path to the centralized media/ directory, creating it if needed."""
    media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media")
    os.makedirs(media_dir, exist_ok=True)
    return media_dir


def copy_file_to_media(source_path):
    """Copy a file into the media/ directory with a UUID-prefixed unique filename.

    Returns the relative path (e.g. 'media/a1b2c3d4_photo.jpg') suitable for
    storing in the database.  Returns an empty string if the source file does
    not exist.
    """
    if not source_path or not os.path.isfile(source_path):
        return ""

    media_dir = get_media_dir()
    _, ext = os.path.splitext(source_path)
    basename = os.path.basename(source_path)
    unique_name = f"{uuid.uuid4().hex[:8]}_{basename}"
    dest_path = os.path.join(media_dir, unique_name)
    shutil.copy2(source_path, dest_path)

    # Return a relative path using forward slashes for portability
    return os.path.join("media", unique_name).replace("\\", "/")


def get_absolute_media_path(relative_path):
    """Convert a relative media path back to an absolute path."""
    if not relative_path:
        return ""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, relative_path)
