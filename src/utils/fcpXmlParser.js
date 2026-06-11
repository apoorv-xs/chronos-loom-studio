// Final Cut Pro 7 XML Timeline Importer Utility

export function parseFcpXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  // 1. Try to read custom chronos_metadata block
  const metaNode = xmlDoc.querySelector("chronos_metadata");
  if (metaNode) {
    try {
      // Decode escaped XML characters
      let jsonStr = metaNode.textContent || '';
      jsonStr = jsonStr
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"');
      
      const meta = JSON.parse(jsonStr);
      if (meta && Array.isArray(meta.nodes)) {
        const parsedNodes = [];
        
        // Scan XML video and audio clipitems to restore media clip properties
        const clipItems = Array.from(xmlDoc.querySelectorAll("clipitem"));
        
        meta.nodes.forEach(mNode => {
          const matchingClip = clipItems.find(c => {
            const cid = c.getAttribute("id");
            return cid && cid.includes(mNode.id);
          });
          
          if (matchingClip) {
            const name = matchingClip.querySelector("name")?.textContent || mNode.name;
            const pathUrl = matchingClip.querySelector("pathurl")?.textContent || '';
            const duration = parseFloat(matchingClip.querySelector("duration")?.textContent || '0') / 30; // default timebase
            const inSec = parseFloat(matchingClip.querySelector("in")?.textContent || '0') / 30;
            const outSec = parseFloat(matchingClip.querySelector("out")?.textContent || '0') / 30;
            
            // Speed factor
            let speed = 1.0;
            const speedVal = matchingClip.querySelector("effect parameter[parameterid='speedmultiplier'] value")?.textContent;
            if (speedVal) {
              speed = parseFloat(speedVal) / 100;
            }

            const type = matchingClip.closest("video") ? 'video' : 'audio';
            let actualType = type;
            if (type === 'video' && (name.toLowerCase().endsWith('.png') || name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg') || name.toLowerCase().endsWith('.webp'))) {
              actualType = 'image';
            }

            parsedNodes.push({
              ...mNode,
              type: actualType,
              name,
              url: pathUrl || 'https://media.w3.org/2010/05/sintel/trailer.mp4', // fallback url
              startTime: inSec,
              endTime: outSec,
              duration: duration || (outSec - inSec) || 10,
              speed,
              locked: mNode.locked || false,
              color: mNode.color || (actualType === 'video' ? 'var(--accent-cyan)' : actualType === 'image' ? 'var(--accent-blue)' : 'var(--accent-pink)')
            });
          } else if (mNode.type === 'sticky') {
            parsedNodes.push({
              id: mNode.id,
              type: 'sticky',
              name: mNode.name || 'Sticky Note',
              text: mNode.text || '',
              x: mNode.x,
              y: mNode.y,
              width: mNode.width || 270,
              color: mNode.color || '#E2DCD2',
              locked: mNode.locked || false
            });
          }
        });
        
        if (parsedNodes.length > 0) {
          return { nodes: parsedNodes, connections: meta.connections || [] };
        }
      }
    } catch (err) {
      console.error("Failed to parse chronos metadata from XML, falling back to standard import:", err);
    }
  }

  // 2. Fallback: Parse standard FCP7 XML
  const nodes = [];
  const connections = [];
  
  const videoClips = Array.from(xmlDoc.querySelectorAll("video track clipitem"));
  const audioClips = Array.from(xmlDoc.querySelectorAll("audio track clipitem"));
  
  let videoIdx = 0;
  videoClips.forEach((clip, idx) => {
    const name = clip.querySelector("name")?.textContent || `Clip ${idx + 1}`;
    let pathUrl = clip.querySelector("pathurl")?.textContent || '';
    if (pathUrl.startsWith("file://localhost/placeholder/")) {
      pathUrl = decodeURIComponent(pathUrl.replace("file://localhost/placeholder/", ""));
    }
    if (!pathUrl || pathUrl.startsWith("file://")) {
      pathUrl = 'https://media.w3.org/2010/05/sintel/trailer.mp4'; // fallback
    }

    const durationVal = parseFloat(clip.querySelector("duration")?.textContent || '300');
    const timebase = parseFloat(clip.querySelector("rate timebase")?.textContent || '30');
    const inVal = parseFloat(clip.querySelector("in")?.textContent || '0');
    const outVal = parseFloat(clip.querySelector("out")?.textContent || '300');
    
    let type = 'video';
    if (name.toLowerCase().endsWith('.png') || name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg') || name.toLowerCase().endsWith('.webp')) {
      type = 'image';
    }

    const id = clip.getAttribute("id") ? clip.getAttribute("id").replace("vclip-", "").split("-")[0] : `imported-v-${idx}`;
    
    nodes.push({
      id,
      type,
      name,
      url: pathUrl,
      x: 80 + videoIdx * 300,
      y: 80,
      width: 250,
      startTime: inVal / timebase,
      endTime: outVal / timebase,
      duration: durationVal / timebase,
      volume: 0.8,
      speed: 1.0,
      locked: false,
      color: type === 'video' ? 'var(--accent-cyan)' : 'var(--accent-blue)'
    });
    
    videoIdx++;
  });

  // Re-link visual clips linearly
  const visualNodes = nodes.filter(n => n.type !== 'audio');
  for (let i = 0; i < visualNodes.length - 1; i++) {
    connections.push({
      id: `conn-imported-${i}`,
      from: visualNodes[i].id,
      to: visualNodes[i + 1].id,
      transition: 'cut',
      duration: 1.0
    });
  }

  // Handle standard audio tracks
  audioClips.forEach((clip, idx) => {
    const name = clip.querySelector("name")?.textContent || `Audio ${idx + 1}`;
    let pathUrl = clip.querySelector("pathurl")?.textContent || '';
    if (pathUrl.startsWith("file://localhost/placeholder/")) {
      pathUrl = decodeURIComponent(pathUrl.replace("file://localhost/placeholder/", ""));
    }
    if (!pathUrl || pathUrl.startsWith("file://")) {
      pathUrl = 'https://assets.mixkit.co/music/preview/mixkit-epic-story-1078.mp3'; // fallback
    }

    const durationVal = parseFloat(clip.querySelector("duration")?.textContent || '300');
    const timebase = parseFloat(clip.querySelector("rate timebase")?.textContent || '30');
    const inVal = parseFloat(clip.querySelector("in")?.textContent || '0');
    const outVal = parseFloat(clip.querySelector("out")?.textContent || '300');
    const startVal = parseFloat(clip.querySelector("start")?.textContent || '0');

    const id = clip.getAttribute("id") ? clip.getAttribute("id").replace("aclip-", "").split("-")[0] : `imported-a-${idx}`;
    
    // Check if node is already added (e.g. video with audio track has dual clipitems)
    const exists = nodes.find(n => n.id === id);
    if (exists) {
      return;
    }

    nodes.push({
      id,
      type: 'audio',
      name,
      url: pathUrl,
      x: 80 + idx * 300,
      y: 330,
      width: 250,
      startTime: inVal / timebase,
      endTime: outVal / timebase,
      duration: durationVal / timebase,
      timelineStart: startVal / timebase,
      volume: 0.5,
      speed: 1.0,
      fadeIn: 1.5,
      fadeOut: 1.5,
      loop: true,
      locked: false,
      color: 'var(--accent-pink)'
    });
  });

  return { nodes, connections };
}
