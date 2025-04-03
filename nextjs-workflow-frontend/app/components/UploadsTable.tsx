import { UploadedImage } from './types';
import { useState } from 'react';

interface UploadsTableProps {
  uploadedImages: UploadedImage[];
}

export default function UploadsTable({ uploadedImages }: UploadsTableProps) {
  const [aiTagStates, setAiTagStates] = useState<{[key: string]: 'pending' | 'sent' | null}>({});

  const handleAiTagRequest = async (instanceId: string, wantTags: boolean) => {
    try {
      const response = await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId,
          approved: wantTags
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send AI tag request');
      }

      setAiTagStates(prev => ({ ...prev, [instanceId]: 'sent' }));
    } catch (error) {
      console.error('Error sending AI tag request:', error);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-3xl overflow-hidden border-2 border-white/10">
      <table className="w-full">
        <thead className="border-b border-white/10">
          <tr>
            <th className="px-8 py-4 text-left text-lg font-light text-white/80">FileName</th>
            <th className="px-8 py-4 text-left text-lg font-light text-white/80">Status</th>
            <th className="px-8 py-4 text-left text-lg font-light text-white/80">AI Image Tags</th>
            <th className="px-8 py-4 text-left text-lg font-light text-white/80">Should Generate Image Tags?</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {[...uploadedImages].reverse().map((image, index) => (
            <tr key={index} className="group">
              <td className="px-8 py-6 text-white/70 group-hover:text-white/90">{image.fileName}</td>
              <td className="px-8 py-6 text-white/70 group-hover:text-white/90">{image.status}</td>
              <td className="px-8 py-6 text-white/70 group-hover:text-white/90">
                {image.aiTags ? image.aiTags : 'N/A'}
              </td>
              <td className="px-8 py-6">
                {aiTagStates[image.instanceId] === 'sent' ? (
                  <span className="text-green-400">Event sent to workflow</span>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAiTagRequest(image.instanceId, true)}
                      className="px-4 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => handleAiTagRequest(image.instanceId, false)}
                      className="px-4 py-2 bg-gray-500/80 hover:bg-gray-500 text-white rounded-lg transition-colors"
                    >
                      No
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {uploadedImages.length === 0 && (
            <tr>
              <td colSpan={4} className="px-8 py-12 text-center text-xl text-white/50">
                No images uploaded yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
} 