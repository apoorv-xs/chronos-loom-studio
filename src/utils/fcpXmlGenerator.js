// Final Cut Pro 7 XML Timeline Exporter Utility

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Generates an FCP7 XML sequence from the CHRONOS timeline nodes.
 * @param {Array} sequence - Ordered list of media nodes from topological sequence
 * @param {number} framerate - Chosen framerate (e.g. 24, 25, 30, 50, 60)
 * @param {string} sequenceName - Custom name for the timeline sequence
 */
export function generateFcpXml(sequence, connections, framerate = 30, sequenceName = "Chronos Sequence") {
  // Backwards compatibility check
  let actualConnections = connections;
  let timebase = Math.round(framerate);
  let isNTSC = framerate === 29.97 || framerate === 59.94 ? "TRUE" : "FALSE";
  let actualSequenceName = sequenceName;
  
  if (typeof connections === 'number') {
    actualConnections = [];
    timebase = Math.round(connections);
    isNTSC = connections === 29.97 || connections === 59.94 ? "TRUE" : "FALSE";
    actualSequenceName = framerate || "Chronos Sequence";
  } else if (!connections) {
    actualConnections = [];
  }
  
  // Clean up sequence name for XML safety
  const escapedSeqName = escapeXml(actualSequenceName);
  
  let totalFrames = 0;
  let videoTrackItems = [];
  let audioTrackItems = [];
  
  let currentFrame = 0;
  
  sequence.forEach((node, idx) => {
    const nodeType = node.type; // 'video' | 'audio' | 'image'
    const duration = node.duration || 10;
    
    const startSec = node.startTime !== undefined ? node.startTime : 0;
    const endSec = node.endTime !== undefined ? node.endTime : duration;
    
    const speed = node.speed || 1.0;
    const clipDurationSec = Math.max(0.1, (endSec - startSec) / speed);
    
    const inFrame = Math.round(startSec * timebase);
    const outFrame = Math.round(endSec * timebase);
    const clipLength = Math.round(clipDurationSec * timebase);
    
    const startFrame = nodeType === 'audio' ? Math.round((node.timelineStart || 0) * timebase) : currentFrame;
    const endFrame = startFrame + clipLength;
    
    const fileId = `file-${node.id}`;
    const escapedNodeName = escapeXml(node.name);
    // Simple placeholder URL that Premiere/DaVinci can use to find the file
    const pathUrl = `file://localhost/placeholder/${encodeURIComponent(node.name)}`;
    
    const fileBlock = `
            <file id="${fileId}">
              <name>${escapedNodeName}</name>
              <pathurl>${pathUrl}</pathurl>
              <rate>
                <timebase>${timebase}</timebase>
                <ntsc>${isNTSC}</ntsc>
              </rate>
              <duration>${Math.round(duration * timebase)}</duration>
            </file>`;

    let speedEffect = '';
    if (speed !== 1.0) {
      speedEffect = `
            <effect>
              <name>Speed</name>
              <effectid>speed</effectid>
              <effectcategory>Motion</effectcategory>
              <effecttype>motion</effecttype>
              <mediatype>video</mediatype>
              <parameter>
                <parameterid>speedmultiplier</parameterid>
                <name>speedmultiplier</name>
                <value>${speed * 100}</value>
              </parameter>
            </effect>`;
    }

    const nextNode = sequence[idx + 1];
    let transitionType = 'cut';
    let conn = null;
    if (nextNode && actualConnections) {
      conn = actualConnections.find(c => c.from === node.id && c.to === nextNode.id);
      if (conn && conn.transition) {
        transitionType = conn.transition;
      }
    }

    if (nodeType === 'video' || nodeType === 'image') {
      videoTrackItems.push(`
          <clipitem id="vclip-${node.id}-${idx}">
            <name>${escapedNodeName}</name>
            <duration>${Math.round(duration * timebase)}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${isNTSC}</ntsc>
            </rate>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            <start>${startFrame}</start>
            <end>${endFrame}</end>
            ${fileBlock}
            ${speedEffect}
          </clipitem>`);

      if (transitionType !== 'cut' && transitionType !== 'none' && nextNode) {
        let effectName = 'Cross Dissolve';
        let effectId = 'Cross Dissolve';
        if (transitionType === 'slide') {
          effectName = 'Slide';
          effectId = 'Slide';
        } else if (transitionType === 'zoom') {
          effectName = 'Cross Zoom';
          effectId = 'Cross Zoom';
        } else if (transitionType === 'fade') {
          effectName = 'Fade In Fade Out';
          effectId = 'Fade In Fade Out';
        } else if (transitionType === 'dissolve') {
          effectName = 'Cross Dissolve';
          effectId = 'Cross Dissolve';
        }
        
        const transitionDuration = Math.round((conn && conn.duration ? conn.duration : 1.0) * timebase);
        const cutPoint = endFrame;
        const transStart = cutPoint - Math.round(transitionDuration / 2);
        const transEnd = cutPoint + Math.round(transitionDuration / 2);
        
        videoTrackItems.push(`
          <transitionitem>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${isNTSC}</ntsc>
            </rate>
            <start>${transStart}</start>
            <end>${transEnd}</end>
            <alignment>center</alignment>
            <cutpoint>${cutPoint}</cutpoint>
            <effect>
              <name>${effectName}</name>
              <effectid>${effectId}</effectid>
              <effectcategory>Transitions</effectcategory>
              <effecttype>transition</effecttype>
              <mediatype>video</mediatype>
            </effect>
          </transitionitem>`);
      }
    }
    
    // Video audio track or audio-only track
    if (nodeType === 'audio' || (nodeType === 'video' && node.volume > 0)) {
      audioTrackItems.push(`
          <clipitem id="aclip-${node.id}-${idx}">
            <name>${escapedNodeName}</name>
            <duration>${Math.round(duration * timebase)}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${isNTSC}</ntsc>
            </rate>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            <start>${startFrame}</start>
            <end>${endFrame}</end>
            ${fileBlock}
          </clipitem>`);
    }
    
    if (nodeType === 'video' || nodeType === 'image') {
      currentFrame = endFrame;
    }
  });
  
  totalFrames = currentFrame;
  
  // Build the complete FCP7 XML markup
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml SYSTEM "fcpxml.dtd">
<xmeml version="5">
  <sequence id="sequence-1">
    <name>${escapedSeqName}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>${isNTSC}</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${isNTSC}</ntsc>
            </rate>
            <pixelaspectratio>Square</pixelaspectratio>
          </samplecharacteristics>
        </format>
        <track>
          ${videoTrackItems.join('\n          ')}
        </track>
      </video>
      <audio>
        <numChannels>2</numChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
        <track>
          ${audioTrackItems.join('\n          ')}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`;

  return xmlContent;
}
