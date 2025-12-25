import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const sanitizeFilename = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 48)
    .trim();

export const exportStoryToTxt = async (text: string, topic: string) => {
  if (!Capacitor.isNativePlatform()) {
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `RadioNocturne_${sanitizeFilename(topic || 'story')}_${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    return { mode: 'browser', path: element.download };
  }

  const safeTopic = sanitizeFilename(topic || 'story') || 'story';
  const fileName = `RadioNocturne_${safeTopic}_${Date.now()}.txt`;
  const folder = 'RadioNocturne';
  const path = `${folder}/${fileName}`;

  await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  return { mode: 'native', path: `Documents/${path}` };
};
