export interface VideoAsset {
  file: File;
  previewUrl: string;
}

export interface ReferenceAsset {
  file: File;
  previewUrl: string;
}

export type VideoFileHandler = (file: File, url: string) => void;
export type ReferenceImageHandler = (file: File, url: string) => void;

export enum UploadError {
  INVALID_TYPE = "Invalid file type. Please upload MP4 or QuickTime files.",
  INVALID_IMAGE_TYPE = "Invalid format. Please upload a PNG, JPG, or WebP screenshot.",
  GENERIC = "An error occurred while processing the file.",
}