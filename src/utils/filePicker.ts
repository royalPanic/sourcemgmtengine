import { open } from '@tauri-apps/plugin-dialog';
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MEDIA_EXTENSIONS, VIDEO_EXTENSIONS } from '../types';

export type PickerMode = 'media' | 'image' | 'video' | 'audio' | 'any';

interface DialogFilter {
  name: string;
  extensions: string[];
}

const FILTERS: Record<PickerMode, DialogFilter[]> = {
  media: [
    { name: 'Media', extensions: MEDIA_EXTENSIONS },
    { name: 'Images', extensions: IMAGE_EXTENSIONS },
    { name: 'Video', extensions: VIDEO_EXTENSIONS },
    { name: 'Audio', extensions: AUDIO_EXTENSIONS },
  ],
  image: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  video: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }],
  audio: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  any: [{ name: 'All Files', extensions: ['*'] }],
};

/**
 * Opens the native file picker and returns the chosen absolute path, or null
 * if the user cancelled. The path is handed to the Rust `import_attachment`
 * command, which copies the file into the app's attachment store.
 */
export async function pickFile(mode: PickerMode = 'media'): Promise<string | null> {
  const selected = await open({
    title: mode === 'any' ? 'Attach File' : 'Attach Media',
    multiple: false,
    directory: false,
    filters: FILTERS[mode],
  });

  return typeof selected === 'string' ? selected : null;
}