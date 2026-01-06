export interface Range {
  start: number;
  end: number;
}

/**
 * Builds an FFmpeg command array to stitch together specific ranges of a video.
 * 
 * Logic:
 * 1. Takes 'Good Ranges' (keepRanges).
 * 2. Trims each range from the source.
 * 3. Resets timestamps (PTS-STARTPTS) to prevent sync issues.
 * 4. Concatenates all trimmed clips into a single output.
 * 
 * @param ranges Array of start/end times in seconds to keep.
 * @param outputName The desired filename for the output (e.g., 'output.mp4').
 * @returns Array of string arguments for FFmpeg (e.g., ['-i', 'input.mp4', ...])
 */
export function buildEditCommand(ranges: Range[], outputName: string): string[] {
  // Base input argument
  // Note: In WASM context, the input file is usually written to MEMFS as 'input.mp4'
  const args = ['-i', 'input.mp4'];

  if (ranges.length === 0) {
    // If no ranges, just copy the input (or handle as error depending on strictness)
    // For now, we return a command that effectively does nothing but transcode
    return [...args, outputName];
  }

  // --- Build Complex Filter ---
  let filterComplex = '';
  let concatInputs = '';

  ranges.forEach((range, i) => {
    // 1. Trim Video & Reset PTS (Presentation Timestamp)
    // [0:v] refers to the first input file, video stream
    // [v${i}] is the temporary label for this segment
    filterComplex += `[0:v]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[v${i}];`;

    // 2. Trim Audio & Reset PTS
    // [0:a] refers to the first input file, audio stream
    filterComplex += `[0:a]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a${i}];`;

    // 3. Accumulate labels for the concat step
    concatInputs += `[v${i}][a${i}]`;
  });

  // 4. Concat Filter
  // n=${ranges.length}: Number of segments
  // v=1:a=1: Output 1 video track and 1 audio track
  // [outv][outa]: Final output labels
  filterComplex += `${concatInputs}concat=n=${ranges.length}:v=1:a=1[outv][outa]`;

  args.push('-filter_complex', filterComplex);

  // --- Mapping & Encoding ---
  
  // Map the output of the concat filter to the file
  args.push('-map', '[outv]', '-map', '[outa]');

  // Video Encoding: H.264
  // -crf 18: Visually lossless (lower is better, 18 is standard high quality)
  // -preset ultrafast: Essential for browser/WASM performance to minimize CPU lockup
  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'ultrafast');

  // Audio Encoding: AAC (Standard)
  args.push('-c:a', 'aac');

  // Output filename
  args.push(outputName);

  return args;
}