'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { UploadedImage, UploadResponse, StatusResponse } from './types';

interface ImageUploadProps {
  onUploadComplete: (image: UploadedImage) => void;
}

export default function ImageUpload({ onUploadComplete }: ImageUploadProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervals = useRef<{[key: string]: NodeJS.Timeout}>({});

  // Function to poll status for a specific image
  const pollStatus = async (instanceId: string) => {
    try {
      console.log('Polling status for instanceId:', instanceId);
      const response = await fetch(`https://workflows-waitforevent.dev-demos.workers.dev/?instanceId=${instanceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }
      const data = await response.json() as StatusResponse;
      console.log('Status data:', data);
      onUploadComplete({
        fileName: selectedImage?.name || '',
        status: data.status.status,
        instanceId,
        aiTags: undefined
      });

      // Stop polling if status is complete
      if (data.status.status === 'complete') {
        if (pollingIntervals.current[instanceId]) {
          clearInterval(pollingIntervals.current[instanceId]);
          delete pollingIntervals.current[instanceId];
        }
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  };

  // Start polling for a new image
  const startPolling = (instanceId: string) => {
    // Clear any existing interval for this instance
    if (pollingIntervals.current[instanceId]) {
      clearInterval(pollingIntervals.current[instanceId]);
    }
    
    // Start new polling interval
    pollingIntervals.current[instanceId] = setInterval(() => {
      pollStatus(instanceId);
    }, 3000);
  };

  // Cleanup polling intervals on component unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervals.current).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

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
      startPolling(data.id);

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

  return (
    <div className="grid grid-cols-4 gap-8">
      {/* Upload Area */}
      <div className="col-span-4">
        <div 
          className="bg-white/5 backdrop-blur-sm rounded-3xl p-12 h-80 flex flex-col items-center justify-center cursor-pointer border-2 border-white/10 hover:border-white/20 transition-all group"
          onClick={() => fileInputRef.current?.click()}
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
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={fileInputRef}
            className="hidden"
          />
        </div>
      </div>

      {/* Upload Button */}
      {selectedImage && (
        <div className="col-span-4 flex justify-center">
          <button
            onClick={handleUpload}
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
      )}
    </div>
  );
} 