import { useEffect, useMemo, useState } from 'react';

interface ImageAttachmentProps {
  file: File;
  onRemove: () => void;
  uploadProgress?: number;
  error?: string;
}

const IMAGE_FILE_PREFIX = 'image/';

const getExtensionLabel = (filename: string) => {
  const extension = filename.split('.').pop();
  return extension ? extension.toUpperCase() : 'FILE';
};

const ImageAttachment = ({ file, onRemove, uploadProgress, error }: ImageAttachmentProps) => {
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const isImageFile = useMemo(() => file.type.startsWith(IMAGE_FILE_PREFIX), [file.type]);

  useEffect(() => {
    if (!isImageFile) {
      setPreview(undefined);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImageFile]);

  return (
    <div className="relative group w-20">
      {isImageFile && preview ? (
        <img src={preview} alt={file.name} className="w-20 h-20 object-cover rounded" />
      ) : (
        <div className="w-20 h-20 rounded bg-muted/70 border border-border/50 p-2 flex flex-col justify-between">
          <div className="text-[10px] font-semibold text-muted-foreground tracking-wide">
            {getExtensionLabel(file.name)}
          </div>
          <div className="text-[10px] leading-tight text-foreground/80 line-clamp-2 break-all">
            {file.name}
          </div>
        </div>
      )}
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
          <div className="text-white text-xs">{uploadProgress}%</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="Remove attachment"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default ImageAttachment;
