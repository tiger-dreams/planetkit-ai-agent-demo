import { useNavigate } from "react-router-dom";
import { useVideoSDK } from "@/contexts/VideoSDKContext";
import { PlanetKitMeetingArea } from "@/components/PlanetKitMeetingArea";

const PlanetKitMeeting = () => {
  const navigate = useNavigate();
  const { planetKitConfig } = useVideoSDK();

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <PlanetKitMeetingArea config={planetKitConfig} onDisconnect={() => navigate('/setup')} />
    </div>
  );
};

export default PlanetKitMeeting;