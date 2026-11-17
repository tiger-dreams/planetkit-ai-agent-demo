/** Follow the SDK-owned room stream, which may become available after evtConnected. */
export function watchRoomAudioInput(
  element: HTMLAudioElement,
  onStream: (stream: MediaStream | null) => void,
): () => void {
  let disposed = false;
  let capturedStream: MediaStream | null = null;
  let connectedStream: MediaStream | null = null;
  let connectedTracks: MediaStreamTrack[] = [];
  let warned = false;

  const refresh = () => {
    if (disposed) return;
    try {
      let stream = element.srcObject instanceof MediaStream ? element.srcObject : null;
      if (!stream) {
        // A captured stream can start empty and acquire tracks later.
        const capture = (element as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
        if (!capturedStream && capture) capturedStream = capture.call(element);
        stream = capturedStream;
      }
      const tracks = stream?.getAudioTracks().filter(track => track.readyState === 'live') ?? [];
      if (stream === connectedStream && tracks.length === connectedTracks.length
        && tracks.every((track, index) => track === connectedTracks[index])) return;

      if (connectedStream) {
        onStream(null);
        connectedStream = null;
        connectedTracks = [];
      }
      if (stream && tracks.length > 0) {
        onStream(stream);
        connectedStream = stream;
        connectedTracks = tracks;
      }
      warned = false;
    } catch (error) {
      if (!warned) console.warn('[HeadlessAgent] Waiting for room audio input:', error);
      warned = true;
    }
  };

  const events = ['loadedmetadata', 'playing', 'emptied'] as const;
  events.forEach(event => element.addEventListener(event, refresh));
  // srcObject and track replacement do not consistently dispatch media-element events.
  const timer = setInterval(refresh, 250);
  refresh();

  return () => {
    disposed = true;
    clearInterval(timer);
    events.forEach(event => element.removeEventListener(event, refresh));
    if (connectedStream) onStream(null);
    connectedStream = null;
    connectedTracks = [];
    // The SDK owns the stream: never stop its tracks here.
  };
}
