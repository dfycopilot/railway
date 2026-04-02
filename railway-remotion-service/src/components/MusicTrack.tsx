import React from "react";
import { Audio } from "remotion";

interface MusicTrackProps {
  url: string;
  volume: number;
}

export const MusicTrack: React.FC<MusicTrackProps> = ({ url, volume }) => {
  return <Audio src={url} volume={volume} />;
};
