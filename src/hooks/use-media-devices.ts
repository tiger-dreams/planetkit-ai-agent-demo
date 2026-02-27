import { useState, useEffect } from 'react';

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

export const useMediaDevices = () => {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');

  const refreshDevices = async () => {
    try {
      // 미디어 접근 권한 요청
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videoInputs: MediaDeviceInfo[] = [];
      const audioInputs: MediaDeviceInfo[] = [];
      const audioOutputs: MediaDeviceInfo[] = [];

      devices.forEach((device) => {
        const deviceInfo: MediaDeviceInfo = {
          deviceId: device.deviceId,
          label: device.label || `${device.kind} ${device.deviceId.slice(0, 8)}`,
          kind: device.kind as MediaDeviceInfo['kind'],
        };

        switch (device.kind) {
          case 'videoinput':
            videoInputs.push(deviceInfo);
            break;
          case 'audioinput':
            audioInputs.push(deviceInfo);
            break;
          case 'audiooutput':
            audioOutputs.push(deviceInfo);
            break;
        }
      });

      setVideoDevices(videoInputs);
      setAudioDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);

      // 기본 디바이스 설정
      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      if (audioOutputs.length > 0 && !selectedAudioOutput) {
        setSelectedAudioOutput(audioOutputs[0].deviceId);
      }
    } catch (error) {
      console.error('Failed to enumerate media devices:', error);
    }
  };

  useEffect(() => {
    refreshDevices();

    // 디바이스 변경 감지
    const handleDeviceChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  return {
    videoDevices,
    audioDevices,
    audioOutputDevices,
    selectedVideoDevice,
    selectedAudioDevice,
    selectedAudioOutput,
    setSelectedVideoDevice,
    setSelectedAudioDevice,
    setSelectedAudioOutput,
    refreshDevices,
  };
};