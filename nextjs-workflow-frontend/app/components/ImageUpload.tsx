'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { UploadedImage, UploadResponse, StatusResponse } from './types';

// Custom hook for polling status
const useStatusPolling = (onStatusUpdate: (image: UploadedImage) => void) => {
  const pollingIntervals = useRef<{[key: string]: NodeJS.Timeout}>({});

  const pollStatus = async (instanceId: string, fileName: string) => {
    try {
      const response = await fetch(`https://workflows-waitforevent.dev-demos.workers.dev/?instanceId=${instanceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }
      const data = await response.json() as StatusResponse;

      onStatusUpdate({
        fileName,
        status: data.status.status,
        instanceId,
        aiTags: undefined
      });

      if (data.status.status === 'complete') {
        await fetchAITags(instanceId, fileName);
      } else if (data.status.error) {
        handleError(instanceId, fileName);
      }
    } catch (error) {
      console.error('Error polling status:', error);
      handleError(instanceId, fileName);
    }
  };

  const fetchAITags = async (instanceId: string, fileName: string) => {
    try {
      const tagsResponse = await fetch(`https://workflows-waitforevent.dev-demos.workers.dev/tags?instanceId=${instanceId}`);
      if (!tagsResponse.ok) {
        throw new Error(`Failed to fetch tags: ${tagsResponse.status}`);
      }
      const tagsData = await tagsResponse.json() as { tags: string };
      
      onStatusUpdate({
        fileName,
        status: 'complete',
        instanceId,
        aiTags: tagsData.tags
      });

      stopPolling(instanceId);
    } catch (error) {
      console.error('Error fetching AI tags:', error);
      handleError(instanceId, fileName);
    }
  };

  const handleError = (instanceId: string, fileName: string) => {
    onStatusUpdate({
      fileName,
      status: 'error',
      instanceId,
      aiTags: undefined
    });
    stopPolling(instanceId);
  };

  const startPolling = (instanceId: string, fileName: string) => {
    stopPolling(instanceId);
    pollingIntervals.current[instanceId] = setInterval(() => {
      pollStatus(instanceId, fileName);
    }, 3000);
  };

  const stopPolling = (instanceId: string) => {
    if (pollingIntervals.current[instanceId]) {
      clearInterval(pollingIntervals.current[instanceId]);
      delete pollingIntervals.current[instanceId];
    }
  };

  useEffect(() => {
    return () => {
      Object.values(pollingIntervals.current).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

  return { startPolling };
};

interface ImageUploadProps {
  onUploadComplete: (image: UploadedImage) => void;
}

// Image Preview Component
const ImagePreview = ({ 
  previewUrl, 
  onSelectImage 
}: { 
  previewUrl: string | null; 
  onSelectImage: () => void;
}) => (
  <div 
    className="bg-white/5 backdrop-blur-sm rounded-3xl p-12 h-80 flex flex-col items-center justify-center cursor-pointer border-2 border-white/10 hover:border-white/20 transition-all group"
    onClick={onSelectImage}
  >
    {previewUrl ? (
      <div className="relative w-full h-full">
        <Image
          src={previewUrl}
          alt="Preview"
          fill
          className="object-contain rounded-2xl"
        />
      </div>
    ) : (
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-light text-white/80 mb-4">Upload Image Area</h2>
        <p className="text-xl text-white/50 group-hover:text-white/60 transition-colors">Click or drag and drop to upload</p>
      </div>
    )}
  </div>
);

// Upload Button Component
const UploadButton = ({ 
  isUploading, 
  onUpload 
}: { 
  isUploading: boolean; 
  onUpload: () => void;
}) => (
  <div className="col-span-4 flex justify-center">
    <button
      onClick={onUpload}
      disabled={isUploading}
      className={`px-8 py-3 text-lg rounded-full transition-all ${
        isUploading 
          ? 'bg-gray-600 cursor-not-allowed' 
          : 'bg-blue-500/80 hover:bg-blue-500 text-white'
      }`}
    >
      {isUploading ? 'Uploading...' : 'Upload Image'}
    </button>
  </div>
);

// Custom hook for handling image upload
const useImageUpload = (onUploadComplete: (image: UploadedImage) => void) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startPolling } = useStatusPolling(onUploadComplete);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('image', selectedImage);

      const response = await fetch('https://workflows-waitforevent.dev-demos.workers.dev/', {
        method: 'POST',
        body: formData,
        mode: 'cors',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json() as UploadResponse;
      if (!data.success) {
        throw new Error(data.message || 'Upload failed');
      }
      
      const newImage = {
        fileName: selectedImage.name,
        status: data.details.status,
        aiTags: undefined,
        instanceId: data.id
      };
      
      onUploadComplete(newImage);
      startPolling(data.id, selectedImage.name);

      setSelectedImage(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return {
    selectedImage,
    previewUrl,
    isUploading,
    fileInputRef,
    handleImageChange,
    handleUpload
  };
};

export default function ImageUpload({ onUploadComplete }: ImageUploadProps) {
  const {
    selectedImage,
    previewUrl,
    isUploading,
    fileInputRef,
    handleImageChange,
    handleUpload
  } = useImageUpload(onUploadComplete);

  return (
    <div className="grid grid-cols-4 gap-8">
      <div className="col-span-4">
        <ImagePreview 
          previewUrl={previewUrl} 
          onSelectImage={() => fileInputRef.current?.click()} 
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          ref={fileInputRef}
          className="hidden"
        />
      </div>

      {selectedImage && (
        <UploadButton 
          isUploading={isUploading} 
          onUpload={handleUpload} 
        />
      )}
    </div>
  );
} 