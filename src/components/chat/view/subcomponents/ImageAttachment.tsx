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
    <div className="group relative w-20">
      {isImageFile && preview ? (
        <img src={preview} alt={file.name} className="h-20 w-20 rounded object-cover" />
      ) : (
        <div className="flex h-20 w-20 flex-col justify-between rounded border border-border/50 bg-muted/70 p-2">
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground">
            {getExtensionLabel(file.name)}
          </div>
          <div className="line-clamp-2 break-all text-[10px] leading-tight text-foreground/80">
            {file.name}
          </div>
        </div>
      )}
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
          <div className="text-xs text-white">{uploadProgress}%</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-red-500/50">
          <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white opacity-100 transition-opacity focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
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
