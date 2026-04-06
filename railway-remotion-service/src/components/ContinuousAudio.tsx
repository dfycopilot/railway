import React from "react";
import { Sequence, Audio } from "remotion";

interface AudioSegment {
  start_frame: number;
  startFrame?: number;
  duration_frames: number;
  durationFrames?: number;
  startFrom?: number;
  endAt?: number;
  trim_start?: number;
  trim_end?: number;
  source_url?: string;
}

interface ContinuousAudioProps {
  audioSegments: AudioSegment[];
  sourceVideoUrl: string;
  fps: number;
}

/**
 * Renders a continuous audio track from the main source video.
 * Each audio segment maps to a specific section of the source,
 * positioned at the correct output frame to maintain speaker
 * audio continuity even during B-roll visual cutaways.
 *
 * This replaces per-VideoSegment audio (which drifts after cuts).
 */
export const ContinuousAudio: React.FC<ContinuousAudioProps> = ({
  audioSegments,
  sourceVideoUrl,
  fps,
}) => {
  if (!audioSegments?.length) return null;

  return (
    <>
      {audioSegments.map((seg, i) => {
        const from = seg.start_frame ?? seg.startFrame ?? 0;
        const duration = seg.duration_frames ?? seg.durationFrames ?? 1;
        const startFrom = seg.startFrom ?? Math.round((seg.trim_start ?? 0) * fps);
        const endAt = seg.endAt ?? Math.round((seg.trim_end ?? 0) * fps);
        const url = seg.source_url ?? sourceVideoUrl;

        if (duration <= 0 || !Number.isFinite(from) || !Number.isFinite(duration)) {
          return null;
        }

        return (
          <Sequence key={`audio-seg-${i}`} from={from} durationInFrames={duration}>
            <Audio
              src={url}
              startFrom={startFrom}
              endAt={endAt > startFrom ? endAt : startFrom + duration}
              volume={1}
            />
          </Sequence>
        );
      })}
    </>
  );
};
