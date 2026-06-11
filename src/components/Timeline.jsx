import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, SkipForward, SkipBack, X, Film, AlertCircle, ChevronDown, Download, Scissors, Music, Eye, EyeOff, Volume2, VolumeX, Lock, Unlock, Type } from 'lucide-react';
import { generateFcpXml } from '../utils/fcpXmlGenerator';
import { getFilterCss } from './Canvas';
import { playUISound } from '../utils/audioSynth';

export default function Timeline({ 
  nodes, 
  setNodes,
  connections, 
  setConnections,
  selectedNodeId,
  setSelectedNodeId,
  isPresentationActive, 
  setIsPresentationActive,
  isSidebarOpen,
  isTimelineOpen,
  onCollapse,
  isPlaying,
  setIsPlaying,
  activeNodeId,
  setActiveNodeId,
  aspectRatio,
  setAspectRatio
}) {
  const [sequence, setSequence] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSubtitle, setActiveSubtitle] = useState('');
  const [exportFramerate, setExportFramerate] = useState(30);
  const [activeTransition, setActiveTransition] = useState(null);
  const [activeTransDuration, setActiveTransDuration] = useState(1.0);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [trimming, setTrimming] = useState(null);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(12);
  const [slidingAudio, setSlidingAudio] = useState(null);
  const [audioTrackVolume, setAudioTrackVolume] = useState(0.4);

  // Track control states
  const [videoTrackVisible, setVideoTrackVisible] = useState(true);
  const [videoTrackMuted, setVideoTrackMuted] = useState(false);
  const [videoTrackLocked, setVideoTrackLocked] = useState(false);

  const [textTrackVisible, setTextTrackVisible] = useState(true);
  const [textTrackLocked, setTextTrackLocked] = useState(false);

  const [audioTrackMuted, setAudioTrackMuted] = useState(false);
  const [audioTrackLocked, setAudioTrackLocked] = useState(false);

  // Separate visual sequence (video/image) from background audio tracks
  const visualSequence = React.useMemo(() => sequence.filter(n => n.type !== 'audio' && n.type !== 'sticky'), [sequence]);
  const backgroundAudioTracks = React.useMemo(() => sequence.filter(n => n.type === 'audio'), [sequence]);

  // Calculate relative and cumulative timeline offsets for each node
  const cardOffsets = React.useMemo(() => {
    let currentOffset = 0;
    return visualSequence.map(node => {
      const startOffset = currentOffset;
      const duration = node.endTime - node.startTime;
      currentOffset += duration;
      return { nodeId: node.id, startOffset, duration };
    });
  }, [visualSequence]);

  const totalDuration = React.useMemo(() => {
    const visualDuration = cardOffsets.reduce((acc, c) => acc + c.duration, 0);
    const maxAudioEnd = backgroundAudioTracks.reduce((max, node) => {
      const end = (node.timelineStart || 0) + (node.endTime - node.startTime);
      return end > max ? end : max;
    }, 0);
    return Math.max(visualDuration, maxAudioEnd, 10); // Minimum 10 seconds timeline view
  }, [cardOffsets, backgroundAudioTracks]);

  const getRatioSize = () => {
    if (aspectRatio === '9:16') {
      return { width: '380px', height: '675px', maxHeight: '80vh', maxWidth: '95vw', aspectRatio: '9/16' };
    }
    if (aspectRatio === '1:1') {
      return { width: '540px', height: '540px', maxHeight: '80vh', maxWidth: '95vw', aspectRatio: '1/1' };
    }
    return { width: '960px', height: '540px', maxHeight: '80vh', maxWidth: '95vw', aspectRatio: '16/9' };
  };

  const handleExportXml = () => {
    if (sequence.length === 0) return;
    try {
      const xmlString = generateFcpXml(sequence, connections, exportFramerate, "Chronos Master Timeline");
      const blob = new Blob([xmlString], { type: 'text/xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chronos_timeline_${exportFramerate}fps.xml`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate or download FCP XML:', err);
    }
  };
  
  const videoRef = useRef(null);
  const bgAudioRef = useRef(null);
  const timerRef = useRef(null);
  const slideDurationRef = useRef(5000); // 5s default for non-timed media

  // Memoize connected sticky notes (subtitles) per visual node ID
  const connectedStickiesMap = React.useMemo(() => {
    const map = {};
    visualSequence.forEach(visNode => {
      const connected = connections
        .filter(c => c.from === visNode.id || c.to === visNode.id)
        .map(c => c.from === visNode.id ? c.to : c.from)
        .map(id => nodes.find(n => n.id === id))
        .filter(n => n && n.type === 'sticky');
      if (connected.length > 0) {
        map[visNode.id] = connected[0];
      }
    });
    return map;
  }, [visualSequence, connections, nodes]);

  // Sync active node ID to parent state — use visual sequence for presentation slides
  const activeNode = isPresentationActive ? visualSequence[currentIndex] : sequence[currentIndex];
  useEffect(() => {
    if (isPresentationActive && activeNode) {
      setActiveNodeId(activeNode.id);
    } else {
      setActiveNodeId(null);
    }
  }, [activeNode, isPresentationActive, setActiveNodeId]);

  // Build the playback sequence based on connections (Topological path traversal)
  useEffect(() => {
    if (nodes.length === 0) {
      setSequence([]);
      return;
    }

    // Map connections
    const adj = {};
    const inDegree = {};
    nodes.forEach(n => {
      adj[n.id] = [];
      inDegree[n.id] = 0;
    });

    connections.forEach(c => {
      if (adj[c.from] && adj[c.to] !== undefined) {
        adj[c.from].push(c.to);
        inDegree[c.to]++;
      }
    });

    // Find start nodes (in-degree 0 and has outgoing connections)
    let startNodes = nodes.filter(n => inDegree[n.id] === 0 && adj[n.id].length > 0);

    // Fallback: If cycles exist or no clear start nodes, grab first node of first connection
    if (startNodes.length === 0 && connections.length > 0) {
      const firstFrom = connections[0].from;
      const node = nodes.find(n => n.id === firstFrom);
      if (node) startNodes.push(node);
    }

    // Fallback 2: Just order all media nodes if no connections are built
    if (connections.length === 0) {
      const mediaNodes = nodes.filter(n => n.type !== 'sticky');
      setSequence(mediaNodes);
      return;
    }

    if (startNodes.length === 0) {
      // Pick any node
      startNodes = [nodes[0]];
    }

    // Traverse linear path
    const path = [];
    const visited = new Set();
    let currId = startNodes[0]?.id;

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const node = nodes.find(n => n.id === currId);
      if (node) {
        path.push(node);
      }
      
      const neighbors = adj[currId] || [];
      // Grab first connected neighbor (simplifies branching for cinematic linear playback)
      currId = neighbors.length > 0 ? neighbors[0] : null;
    }

    // Add remaining unlinked media nodes at the end to keep it full
    const linkedIds = new Set(path.map(n => n.id));
    const unlinkedMedia = nodes.filter(n => n.type !== 'sticky' && !linkedIds.has(n.id));
    
    setSequence([...path, ...unlinkedMedia]);
  }, [nodes, connections]);

  // Handle active slide transitions on slide change
  useEffect(() => {
    if (!isPresentationActive) {
      setActiveTransition(null);
      return;
    }
    
    if (currentIndex > 0 && sequence[currentIndex - 1] && sequence[currentIndex]) {
      const prev = sequence[currentIndex - 1];
      const curr = sequence[currentIndex];
      const conn = connections.find(c => c.from === prev.id && c.to === curr.id);
      if (conn && conn.transition && conn.transition !== 'cut' && conn.transition !== 'none') {
        setActiveTransition(conn.transition);
        setActiveTransDuration(conn.duration || 1.0);
        
        const timer = setTimeout(() => {
          setActiveTransition(null);
        }, (conn.duration || 1.0) * 1000);
        return () => clearTimeout(timer);
      }
    }
    setActiveTransition(null);
  }, [currentIndex, sequence, connections, isPresentationActive]);

  // Handle slide transitions and active subtitle scanning
  useEffect(() => {
    if (!isPresentationActive || !activeNode) {
      setActiveSubtitle('');
      return;
    }

    // Look for any text nodes/sticky notes connected to the active node
    const connectedStickies = connections
      .filter(c => c.from === activeNode.id || c.to === activeNode.id)
      .map(c => c.from === activeNode.id ? c.to : c.from)
      .map(id => nodes.find(n => n.id === id))
      .filter(n => n && n.type === 'sticky');

    if (connectedStickies.length > 0) {
      setActiveSubtitle(connectedStickies[0].text);
    } else {
      setActiveSubtitle('');
    }

    // Clear previous timers
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isPlaying) {
      const speed = activeNode.speed || 1.0;
      if (activeNode.type === 'video') {
        // Handled by video elements onEnded or timeUpdate bounds
      } else {
        // Image or Sticky slide (default 4s, scales with speed multiplier!)
        const dur = activeNode.endTime && activeNode.startTime != null
          ? ((activeNode.endTime - activeNode.startTime) / speed) * 1000
          : 4000 / speed;
        timerRef.current = setTimeout(() => {
          handleNext();
        }, dur);
      }
    }
  }, [currentIndex, isPlaying, isPresentationActive, activeNode]);

  // Play video clip when active node changes
  useEffect(() => {
    if (isPresentationActive && activeNode && activeNode.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = activeNode.startTime;
      videoRef.current.volume = videoTrackMuted ? 0 : activeNode.volume;
      videoRef.current.playbackRate = activeNode.speed || 1.0;
      if (isPlaying) {
        videoRef.current.play().catch(err => console.log('Autoplay blocked:', err));
      }
    }
  }, [currentIndex, isPresentationActive, isPlaying, activeNode, videoTrackMuted]);

  // Background audio: play audio tracks alongside visual slides
  useEffect(() => {
    if (!bgAudioRef.current) return;
    const bgTrack = backgroundAudioTracks[0]; // Play first background audio track
    if (!bgTrack) {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current.src = "";
      }
      return;
    }

    if (!isPresentationActive || !isPlaying) {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
      if (!isPresentationActive && bgAudioRef.current) {
        bgAudioRef.current.currentTime = 0;
      }
      return;
    }

    const timelineStart = bgTrack.timelineStart || 0;
    const duration = bgTrack.endTime - bgTrack.startTime;
    const timelineEnd = timelineStart + duration;

    // Check if the playhead is within the audio clip's active timeline bounds
    if (playheadTime >= timelineStart && playheadTime <= timelineEnd) {
      // Calculate target playback time with loop cycling support
      let targetAudioTime = bgTrack.startTime + (playheadTime - timelineStart);
      if (bgTrack.loop && duration > 0) {
        targetAudioTime = bgTrack.startTime + ((playheadTime - timelineStart) % duration);
      }

      // Calculate real-time volume with fade-in and fade-out attenuations
      let currentVolume = (audioTrackMuted ? 0 : (bgTrack.volume || 0.4)) * audioTrackVolume;
      const progress = playheadTime - timelineStart;
      const remaining = timelineEnd - playheadTime;
      const fadeIn = bgTrack.fadeIn || 0;
      const fadeOut = bgTrack.fadeOut || 0;

      if (fadeIn > 0 && progress < fadeIn && progress >= 0) {
        currentVolume *= (progress / fadeIn);
      }
      if (fadeOut > 0 && remaining < fadeOut && remaining >= 0) {
        currentVolume *= Math.max(0, remaining / fadeOut);
      }
      currentVolume = Math.max(0, Math.min(1, currentVolume));

      // If the audio source is not set, set it
      if (bgAudioRef.current.src !== bgTrack.url) {
        bgAudioRef.current.src = bgTrack.url;
        bgAudioRef.current.currentTime = targetAudioTime;
        bgAudioRef.current.volume = currentVolume;
        bgAudioRef.current.playbackRate = bgTrack.speed || 1.0;
        bgAudioRef.current.play().catch(err => {});
      } else {
        // If it is paused, play it
        if (bgAudioRef.current.paused) {
          bgAudioRef.current.currentTime = targetAudioTime;
          bgAudioRef.current.volume = currentVolume;
          bgAudioRef.current.playbackRate = bgTrack.speed || 1.0;
          bgAudioRef.current.play().catch(err => {});
        } else {
          // Sync drift if it's more than 0.3 seconds off
          const drift = Math.abs(bgAudioRef.current.currentTime - targetAudioTime);
          if (drift > 0.3) {
            bgAudioRef.current.currentTime = targetAudioTime;
          }
          bgAudioRef.current.volume = currentVolume;
        }
      }
    } else {
      // Playhead is outside the audio clip, pause it
      if (!bgAudioRef.current.paused) {
        bgAudioRef.current.pause();
      }
    }
  }, [isPresentationActive, isPlaying, playheadTime, backgroundAudioTracks, audioTrackMuted, audioTrackVolume]);



  const handleStartPresentation = () => {
    if (sequence.length === 0) return;
    playUISound('swell');
    setCurrentIndex(0);
    setIsPresentationActive(true);
    setIsPlaying(true);
  };

  const handleStopPresentation = () => {
    setIsPresentationActive(false);
    setIsPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (videoRef.current) videoRef.current.pause();
    if (bgAudioRef.current) { bgAudioRef.current.pause(); bgAudioRef.current.currentTime = 0; }
  };

  const handleNext = () => {
    const len = isPresentationActive ? visualSequence.length : sequence.length;
    if (currentIndex < len - 1) {
      playUISound('change');
      setCurrentIndex(prev => prev + 1);
    } else {
      // Loop sequence or stop
      handleStopPresentation();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      playUISound('change');
      setCurrentIndex(prev => prev - 1);
    }
  };

  const togglePlayback = () => {
    playUISound('click');
    setIsPlaying(prev => {
      const nextPlay = !prev;
      if (videoRef.current) {
        if (nextPlay) videoRef.current.play().catch(err => {});
        else videoRef.current.pause();
      }
      return nextPlay;
    });
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !activeNode) return;
    const current = videoRef.current.currentTime;
    
    // Cross-fade check or transition trigger
    if (current >= activeNode.endTime) {
      videoRef.current.pause();
      handleNext();
    }
  };

  // Drag-and-drop reordering for sequence cards
  const handleDragStart = (e, index) => {
    const node = sequence[index];
    if (!node) return;
    const isLocked = 
      (node.type === 'video' || node.type === 'image') ? videoTrackLocked :
      (node.type === 'audio') ? audioTrackLocked : false;
      
    if (isLocked) {
      e.preventDefault();
      playUISound('alert');
      return;
    }
    setDraggedIndex(index);
    playUISound('click');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    // Create new sequence by moving the dragged item to target index
    const newSeq = [...sequence];
    const [draggedItem] = newSeq.splice(draggedIndex, 1);
    newSeq.splice(targetIndex, 0, draggedItem);
    
    playUISound('change');

    // Rebuild connections to match the new sequence
    const newConnections = [];

    // 1. Keep connections that involve sticky notes (subtitles)
    const stickyConns = connections.filter(c => {
      const fromNode = nodes.find(n => n.id === c.from);
      const toNode = nodes.find(n => n.id === c.to);
      return (fromNode?.type === 'sticky' || toNode?.type === 'sticky');
    });
    newConnections.push(...stickyConns);

    // 2. Create/preserve connections for adjacent pairs in the new sequence
    for (let i = 0; i < newSeq.length - 1; i++) {
      const fromId = newSeq[i].id;
      const toId = newSeq[i + 1].id;
      
      const existing = connections.find(c => c.from === fromId && c.to === toId);
      if (existing) {
        newConnections.push(existing);
      } else {
        newConnections.push({
          id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          from: fromId,
          to: toId,
          transition: 'cut',
          duration: 1.0
        });
      }
    }

    setConnections(newConnections);
    
    // Instantly update our local sequence so there's no visual stutter
    setSequence(newSeq);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Handle mouse movements for drag-to-trim
  useEffect(() => {
    if (!trimming) return;

    const handleMouseMove = (e) => {
      const { nodeId, handle, initialX, initialValue } = trimming;
      const deltaX = e.clientX - initialX;
      
      const deltaSeconds = deltaX / timelineZoom;
      
      setNodes(prevNodes => prevNodes.map(node => {
        if (node.id !== nodeId) return node;
        
        let newStartTime = node.startTime;
        let newEndTime = node.endTime;
        let newDuration = node.duration || 10;
        
        if (handle === 'left') {
          newStartTime = initialValue + deltaSeconds;
          if (newStartTime < 0) newStartTime = 0;
          if (newStartTime > node.endTime - 0.5) newStartTime = node.endTime - 0.5;
        } else {
          newEndTime = initialValue + deltaSeconds;
          if (newEndTime > newDuration && (node.type === 'video' || node.type === 'audio')) {
            newEndTime = newDuration;
          }
          if (newEndTime < node.startTime + 0.5) newEndTime = node.startTime + 0.5;
          if (newEndTime > newDuration) {
            newDuration = newEndTime;
          }
        }
        
        return { ...node, startTime: newStartTime, endTime: newEndTime, duration: newDuration };
      }));
    };

    const handleMouseUp = () => {
      setTrimming(null);
      playUISound('click');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [trimming, setNodes, timelineZoom]);

  // Track playhead during active presentation playback
  const playheadIntervalRef = useRef(null);
  const trackContainerRef = useRef(null);

  useEffect(() => {
    if (!isPresentationActive || !isPlaying) {
      if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
      return;
    }

    playheadIntervalRef.current = setInterval(() => {
      setPlayheadTime(prev => {
        const next = prev + 0.05;
        if (next >= totalDuration) return totalDuration;
        return next;
      });
    }, 50);

    return () => {
      if (playheadIntervalRef.current) clearInterval(playheadIntervalRef.current);
    };
  }, [isPresentationActive, isPlaying, totalDuration]);

  // Sync playhead when currentIndex changes
  useEffect(() => {
    if (currentIndex >= 0 && cardOffsets[currentIndex]) {
      setPlayheadTime(cardOffsets[currentIndex].startOffset);
    }
  }, [currentIndex, cardOffsets]);

  // Ruler scrubbing: click/drag on ruler to seek
  const handleRulerMouseDown = (e) => {
    const rect = trackContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = trackContainerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = x / timelineZoom;
    seekToTime(Math.max(0, Math.min(time, totalDuration)));
    setIsScrubbing(true);
  };

  const handleRulerMouseMove = (e) => {
    if (!isScrubbing) return;
    const rect = trackContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = trackContainerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = x / timelineZoom;
    seekToTime(Math.max(0, Math.min(time, totalDuration)));
  };

  const handleRulerMouseUp = () => {
    setIsScrubbing(false);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    window.addEventListener('mousemove', handleRulerMouseMove);
    window.addEventListener('mouseup', handleRulerMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleRulerMouseMove);
      window.removeEventListener('mouseup', handleRulerMouseUp);
    };
  }, [isScrubbing, timelineZoom, totalDuration]);

  // Handle sliding/dragging audio clips horizontally on the timeline
  useEffect(() => {
    if (!slidingAudio) return;
    
    const handleMouseMove = (e) => {
      const { id, initialX, initialStart } = slidingAudio;
      const deltaX = e.clientX - initialX;
      const deltaSeconds = deltaX / timelineZoom;
      let newStart = initialStart + deltaSeconds;
      if (newStart < 0) newStart = 0;
      newStart = Math.round(newStart * 10) / 10;
      
      setNodes(prev => prev.map(n => n.id === id ? { ...n, timelineStart: newStart } : n));
    };
    
    const handleMouseUp = () => {
      setSlidingAudio(null);
      playUISound('click');
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [slidingAudio, timelineZoom, setNodes]);

  const seekToTime = (time) => {
    setPlayheadTime(time);
    // Find which card this time falls into
    for (let i = 0; i < cardOffsets.length; i++) {
      const { startOffset, duration } = cardOffsets[i];
      if (time >= startOffset && time < startOffset + duration) {
        if (currentIndex !== i) {
          setCurrentIndex(i);
        }
        break;
      }
    }
  };

  // Cycle transition between two sequence cards
  const TRANSITIONS = ['none', 'cut', 'fade', 'slide', 'zoom', 'dissolve'];
  const TRANS_LABELS = { none: '—', cut: 'C', fade: 'F', slide: 'S', zoom: 'Z', dissolve: 'D' };

  const cycleTimelineTransition = (fromNodeId, toNodeId) => {
    setConnections(prev => prev.map(conn => {
      if (conn.from === fromNodeId && conn.to === toNodeId) {
        const idx = TRANSITIONS.indexOf(conn.transition || 'cut');
        const next = TRANSITIONS[(idx + 1) % TRANSITIONS.length];
        playUISound('change');
        return { ...conn, transition: next };
      }
      return conn;
    }));
  };

  // Split clip at playhead position
  const handleSplitClip = () => {
    if (sequence.length === 0) return;

    // Find which card the playhead is currently inside
    let targetIdx = -1;
    let localTime = 0;
    for (let i = 0; i < cardOffsets.length; i++) {
      const { startOffset, duration } = cardOffsets[i];
      if (playheadTime >= startOffset && playheadTime < startOffset + duration) {
        targetIdx = i;
        localTime = playheadTime - startOffset;
        break;
      }
    }
    
    if (targetIdx < 0 || localTime < 0.5) return; // Don't split if too close to edge
    
    const targetNode = sequence[targetIdx];
    if (!targetNode) return;

    // Check track lock
    const isLocked = (targetNode.type === 'video' || targetNode.type === 'image') ? videoTrackLocked :
                     (targetNode.type === 'audio') ? audioTrackLocked : false;
    if (isLocked) {
      playUISound('alert');
      return;
    }

    const splitPoint = targetNode.startTime + localTime;
    if (splitPoint >= targetNode.endTime - 0.5) return; // Too close to end

    const newNodeId = `node-${Date.now()}`;

    // Create the second half node
    const newNode = {
      ...targetNode,
      id: newNodeId,
      name: `${targetNode.name} (split)`,
      startTime: splitPoint,
      x: targetNode.x + 260,
    };

    // Update the original node's endTime
    setNodes(prev => [
      ...prev.map(n => n.id === targetNode.id ? { ...n, endTime: splitPoint } : n),
      newNode
    ]);

    // Wire the two halves together and update existing downstream connections
    setConnections(prev => {
      const updated = prev.map(conn => {
        if (conn.from === targetNode.id) {
          return { ...conn, from: newNodeId };
        }
        return conn;
      });
      updated.push({
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: targetNode.id,
        to: newNodeId,
        transition: 'cut',
        duration: 0.5
      });
      return updated;
    });

    playUISound('click');
  };

  return (
    <>
      {/* Bottom Timeline sequence bar */}
      <div 
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: '24px',
          left: isSidebarOpen ? '300px' : '24px',
          right: '204px',
          height: '230px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 16px',
          gap: '10px',
          zIndex: 10,
          pointerEvents: isTimelineOpen ? 'auto' : 'none',
          border: '1px solid var(--border-glass)',
          transform: isTimelineOpen ? 'translateY(0)' : 'translateY(250px)',
          opacity: isTimelineOpen ? 1 : 0,
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease'
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* 1. Timeline Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '12px',
          flexShrink: 0
        }}>
          {/* Title & Timecode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px', letterSpacing: '0.5px' }}>
              Master Timeline
            </span>
            <span style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: '11px',
              fontWeight: 400,
              color: 'var(--accent-cyan)',
              background: 'rgba(0, 255, 255, 0.05)',
              border: '1px solid rgba(0, 255, 255, 0.15)',
              borderRadius: '4px',
              padding: '2px 8px',
              letterSpacing: '1px'
            }}>
              {Math.floor(playheadTime / 60).toString().padStart(2, '0')}:{Math.floor(playheadTime % 60).toString().padStart(2, '0')}.{Math.floor((playheadTime % 1) * 100).toString().padStart(2, '0')}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {sequence.length} clips • {totalDuration.toFixed(1)}s total
            </span>
          </div>

          {/* Controls toolbar */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={handleStartPresentation}
              disabled={sequence.length === 0}
              style={{
                background: 'linear-gradient(135deg, rgba(232, 157, 108, 0.18) 0%, rgba(200, 184, 138, 0.1) 100%)',
                border: '1px solid rgba(232, 157, 108, 0.4)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '11px',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: sequence.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: sequence.length === 0 ? 0.4 : 1
              }}
              onMouseEnter={(e) => {
                if (sequence.length === 0) return;
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232, 157, 108, 0.28) 0%, rgba(200, 184, 138, 0.15) 100%)';
                e.currentTarget.style.borderColor = 'rgba(232, 157, 108, 0.7)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(232, 157, 108, 0.3)';
              }}
              onMouseLeave={(e) => {
                if (sequence.length === 0) return;
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232, 157, 108, 0.18) 0%, rgba(200, 184, 138, 0.1) 100%)';
                e.currentTarget.style.borderColor = 'rgba(232, 157, 108, 0.4)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              title="Start linear playback sequence in presentation mode"
            >
              <Film size={12} />
              Play
            </button>

            <select
              value={exportFramerate}
              onChange={(e) => setExportFramerate(Number(e.target.value))}
              className="select-nle-framerate"
              title="Select sequence framerate for FCP XML export"
            >
              <option value={24}>24 fps</option>
              <option value={25}>25 fps</option>
              <option value={30}>30 fps</option>
              <option value={50}>50 fps</option>
              <option value={60}>60 fps</option>
            </select>

            <select
              value={aspectRatio}
              onChange={(e) => {
                setAspectRatio(e.target.value);
                playUISound('change');
              }}
              className="select-nle-framerate"
              title="Select sequence aspect ratio"
            >
              <option value="16:9">16:9 (Widescreen)</option>
              <option value="9:16">9:16 (Vertical)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>

            {/* Split scissors */}
            <button
              onClick={handleSplitClip}
              disabled={sequence.length === 0 || videoTrackLocked}
              className="btn-timeline-split"
              title="Split clip at playhead position"
            >
              <Scissors size={12} />
            </button>

            {/* Timeline Zoom Controls */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '2px', 
              background: 'rgba(0, 0, 0, 0.25)', 
              border: '1px solid var(--border-glass)', 
              borderRadius: '6px', 
              padding: '2px 4px' 
            }}>
              <button
                onClick={() => {
                  setTimelineZoom(prev => Math.max(4, prev - 2));
                  playUISound('click');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  outline: 'none'
                }}
                title="Zoom Out"
              >
                -
              </button>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: '28px', textAlign: 'center', userSelect: 'none' }}>
                {Math.round((timelineZoom / 12) * 100)}%
              </span>
              <button
                onClick={() => {
                  setTimelineZoom(prev => Math.min(40, prev + 2));
                  playUISound('click');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  outline: 'none'
                }}
                title="Zoom In"
              >
                +
              </button>
            </div>

            <button
              onClick={handleExportXml}
              disabled={sequence.length === 0}
              className="btn-nle-export"
              title="Export FCP7 XML timeline file for Premiere, Resolve, or Filmora"
              style={{
                background: 'linear-gradient(135deg, rgba(163, 177, 155, 0.15) 0%, rgba(200, 184, 138, 0.08) 100%)',
                border: '1px solid rgba(163, 177, 155, 0.4)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '11px',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: sequence.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: sequence.length === 0 ? 0.4 : 1
              }}
              onMouseEnter={(e) => {
                if (sequence.length === 0) return;
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(163, 177, 155, 0.25) 0%, rgba(200, 184, 138, 0.12) 100%)';
                e.currentTarget.style.borderColor = 'rgba(163, 177, 155, 0.7)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(163, 177, 155, 0.3)';
              }}
              onMouseLeave={(e) => {
                if (sequence.length === 0) return;
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(163, 177, 155, 0.15) 0%, rgba(200, 184, 138, 0.08) 100%)';
                e.currentTarget.style.borderColor = 'rgba(163, 177, 155, 0.4)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Download size={12} />
              Export
            </button>

            {/* Collapse Button */}
            <button
              onClick={onCollapse}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s, background-color 0.2s, transform 0.2s',
                outline: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Collapse Timeline"
            >
              <ChevronDown size={12} />
            </button>
          </div>
        </div>

        {/* 2. Main Track Editor Grid */}
        <div style={{
          flex: 1,
          display: 'flex',
          background: 'rgba(0,0,0,0.15)',
          border: '1px solid var(--border-glass)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Left Column: Track Headers */}
          <div style={{
            width: '95px',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-glass)',
            background: 'rgba(0,0,0,0.25)',
            flexShrink: 0,
            userSelect: 'none'
          }}>
            {/* Ruler Spacer */}
            <div style={{ height: '20px', borderBottom: '1px solid var(--border-glass)' }} />
            
            {/* Video Track (V1) Header */}
            <div style={{
              height: '50px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 8px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              gap: '4px'
            }}>
              <span style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Film size={10} style={{ color: 'var(--accent-cyan)' }} /> Video 1
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => { setVideoTrackVisible(!videoTrackVisible); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: videoTrackVisible ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title={videoTrackVisible ? "Mute visual track" : "Unmute visual track"}
                >
                  {videoTrackVisible ? <Eye size={10} /> : <EyeOff size={10} style={{ color: 'var(--accent-pink)' }} />}
                </button>
                <button 
                  onClick={() => { setVideoTrackMuted(!videoTrackMuted); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: videoTrackMuted ? 'var(--accent-pink)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                  title={videoTrackMuted ? "Unmute video volume" : "Mute video volume"}
                >
                  {videoTrackMuted ? <VolumeX size={10} style={{ color: 'var(--accent-pink)' }} /> : <Volume2 size={10} />}
                </button>
                <button 
                  onClick={() => { setVideoTrackLocked(!videoTrackLocked); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: videoTrackLocked ? 'var(--accent-amber)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title={videoTrackLocked ? "Unlock track editing" : "Lock track editing"}
                >
                  {videoTrackLocked ? <Lock size={10} style={{ color: 'var(--accent-amber)' }} /> : <Unlock size={10} />}
                </button>
              </div>
            </div>

            {/* Text Track (T1) Header */}
            <div style={{
              height: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 8px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              gap: '4px'
            }}>
              <span style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Type size={10} style={{ color: 'rgba(232, 157, 108, 0.9)' }} /> Text 1
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => { setTextTrackVisible(!textTrackVisible); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: textTrackVisible ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title={textTrackVisible ? "Hide subtitles" : "Show subtitles"}
                >
                  {textTrackVisible ? <Eye size={10} /> : <EyeOff size={10} style={{ color: 'var(--accent-pink)' }} />}
                </button>
                <button 
                  onClick={() => { setTextTrackLocked(!textTrackLocked); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: textTrackLocked ? 'var(--accent-amber)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title={textTrackLocked ? "Unlock text track" : "Lock text track"}
                >
                  {textTrackLocked ? <Lock size={10} style={{ color: 'var(--accent-amber)' }} /> : <Unlock size={10} />}
                </button>
              </div>
            </div>

            {/* Audio Track (A1) Header */}
            <div style={{
              height: '50px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 8px',
              gap: '4px'
            }}>
              <span style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Music size={10} style={{ color: 'var(--accent-pink)' }} /> Audio 1
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  onClick={() => { setAudioTrackMuted(!audioTrackMuted); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: audioTrackMuted ? 'var(--accent-pink)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                  title={audioTrackMuted ? "Unmute background audio" : "Mute background audio"}
                >
                  {audioTrackMuted ? <VolumeX size={10} style={{ color: 'var(--accent-pink)' }} /> : <Volume2 size={10} />}
                </button>
                <button 
                  onClick={() => { setAudioTrackLocked(!audioTrackLocked); playUISound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: audioTrackLocked ? 'var(--accent-amber)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title={audioTrackLocked ? "Unlock audio editing" : "Lock audio editing"}
                >
                  {audioTrackLocked ? <Lock size={10} style={{ color: 'var(--accent-amber)' }} /> : <Unlock size={10} />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioTrackVolume}
                  onChange={(e) => setAudioTrackVolume(parseFloat(e.target.value))}
                  disabled={audioTrackMuted}
                  title={`Track Volume: ${Math.round(audioTrackVolume * 100)}%`}
                  style={{
                    width: '38px',
                    height: '4px',
                    borderRadius: '2px',
                    background: audioTrackMuted ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
                    cursor: audioTrackMuted ? 'not-allowed' : 'pointer'
                  }}
                  className="track-volume-slider"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Scrollable Tracks Wrapper */}
          <div 
            ref={trackContainerRef}
            style={{
              flex: 1,
              overflowX: 'auto',
              overflowY: 'hidden',
              position: 'relative'
            }}
          >
            {/* Scrollable Tracks Content Area */}
            <div style={{
              width: `${totalDuration * timelineZoom + 100}px`,
              minWidth: '100%',
              height: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}>
              
              {/* Ruler Track */}
              <div
                onMouseDown={handleRulerMouseDown}
                style={{
                  height: '20px',
                  background: 'rgba(0,0,0,0.3)',
                  borderBottom: '1px solid var(--border-glass)',
                  position: 'relative',
                  cursor: 'ew-resize',
                  userSelect: 'none'
                }}
              >
                {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                  <React.Fragment key={i}>
                    {i % 5 === 0 ? (
                      <>
                        <div className="timeline-ruler-tick major" style={{ left: `${i * timelineZoom}px` }} />
                        <span className="timeline-ruler-label" style={{ left: `${i * timelineZoom}px` }}>
                          {i}s
                        </span>
                      </>
                    ) : (
                      <div className="timeline-ruler-tick minor" style={{ left: `${i * timelineZoom}px` }} />
                    )}
                  </React.Fragment>
                ))}
                
                {/* Playhead arrow tip */}
                <div style={{
                  position: 'absolute',
                  left: `${playheadTime * timelineZoom}px`,
                  top: 0,
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '6px solid var(--accent-cyan)',
                  transform: 'translateX(-5px)',
                  zIndex: 35
                }} />
              </div>

              {/* Lane 1: Video Track (V1) */}
              <div style={{
                height: '50px',
                position: 'relative',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center'
              }}>
                {visualSequence.map((node) => {
                  const idx = sequence.findIndex(n => n.id === node.id);
                  const offset = cardOffsets.find(co => co.nodeId === node.id);
                  if (!offset) return null;

                  const visIdx = visualSequence.findIndex(n => n.id === node.id);
                  const prevVisNode = visIdx > 0 ? visualSequence[visIdx - 1] : null;
                  const conn = prevVisNode ? connections.find(c => c.from === prevVisNode.id && c.to === node.id) : null;

                  return (
                    <React.Fragment key={node.id}>
                      {conn && (
                        <div
                          className="timeline-transition-badge"
                          onClick={(e) => {
                            e.stopPropagation();
                            cycleTimelineTransition(prevVisNode.id, node.id);
                          }}
                          style={{
                            position: 'absolute',
                            left: `${offset.startOffset * timelineZoom}px`,
                            transform: 'translateX(-50%)',
                            top: '14px',
                            zIndex: 25
                          }}
                          title={`${conn.transition || 'cut'} — Click to cycle`}
                        >
                          {TRANS_LABELS[conn.transition || 'cut'] || 'C'}
                        </div>
                      )}

                      <div 
                        draggable={!trimming && !videoTrackLocked}
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, idx)}
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          playUISound('click');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          height: '40px',
                          position: 'absolute',
                          left: `${offset.startOffset * timelineZoom}px`,
                          width: `${Math.max(100, (node.endTime - node.startTime) * timelineZoom)}px`,
                          borderRadius: '4px',
                          border: draggedIndex === idx 
                            ? '1px dashed var(--accent-cyan)' 
                            : dragOverIndex === idx 
                              ? '1px solid var(--accent-cyan)' 
                              : selectedNodeId === node.id
                                ? '1px solid #ffffff'
                                : '1px solid var(--border-glass)',
                          background: draggedIndex === idx 
                            ? 'rgba(0, 255, 255, 0.05)' 
                            : dragOverIndex === idx 
                              ? 'rgba(232, 157, 108, 0.08)' 
                              : selectedNodeId === node.id
                                ? 'rgba(255, 255, 255, 0.08)'
                                : node.type === 'video'
                                  ? 'rgba(0, 255, 255, 0.06)'
                                  : 'rgba(138, 127, 166, 0.06)',
                          padding: '4px 10px',
                          cursor: videoTrackLocked ? 'not-allowed' : 'grab',
                          opacity: draggedIndex === idx ? 0.5 : videoTrackVisible ? 1 : 0.4,
                          transition: trimming ? 'none' : 'all 0.2s ease',
                          boxShadow: dragOverIndex === idx ? '0 0 8px rgba(232, 157, 108, 0.2)' : 'none',
                          overflow: 'hidden'
                        }}
                      >
                        {!videoTrackLocked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setTrimming({
                                nodeId: node.id,
                                handle: 'left',
                                initialX: e.clientX,
                                initialValue: node.startTime
                              });
                              playUISound('click');
                            }}
                            className="timeline-trim-handle left"
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: '5px',
                              height: '100%',
                              cursor: 'ew-resize',
                              background: 'rgba(232, 157, 108, 0.2)',
                              borderTopLeftRadius: '3px',
                              borderBottomLeftRadius: '3px',
                              borderRight: '1px solid rgba(232, 157, 108, 0.4)',
                              zIndex: 2
                            }}
                            title={`In: ${node.startTime.toFixed(1)}s`}
                          />
                        )}

                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px',
                          fontWeight: '700',
                          userSelect: 'none',
                          flexShrink: 0
                        }}>
                          {idx + 1}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, userSelect: 'none' }}>
                          <span style={{ fontSize: '9px', fontWeight: '500', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {node.name}
                          </span>
                          <span style={{ fontSize: '7px', color: 'var(--text-muted)' }}>
                            {(node.endTime - node.startTime).toFixed(1)}s • {node.filter || 'normal'}
                          </span>
                        </div>

                        {!videoTrackLocked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setTrimming({
                                nodeId: node.id,
                                handle: 'right',
                                initialX: e.clientX,
                                initialValue: node.endTime
                              });
                              playUISound('click');
                            }}
                            className="timeline-trim-handle right"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              width: '5px',
                              height: '100%',
                              cursor: 'ew-resize',
                              background: 'rgba(232, 157, 108, 0.2)',
                              borderTopRightRadius: '3px',
                              borderBottomRightRadius: '3px',
                              borderLeft: '1px solid rgba(232, 157, 108, 0.4)',
                              zIndex: 2
                            }}
                            title={`Out: ${node.endTime.toFixed(1)}s`}
                          />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Lane 2: Text Track (T1) */}
              <div style={{
                height: '40px',
                position: 'relative',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center'
              }}>
                {visualSequence.map((node) => {
                  const offset = cardOffsets.find(co => co.nodeId === node.id);
                  if (!offset) return null;

                  const stickyNode = connectedStickiesMap[node.id];
                  if (!stickyNode) return null;

                  return (
                    <div 
                      key={stickyNode.id}
                      onClick={() => {
                        setSelectedNodeId(stickyNode.id);
                        playUISound('click');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        height: '30px',
                        position: 'absolute',
                        left: `${offset.startOffset * timelineZoom}px`,
                        width: `${Math.max(100, offset.duration * timelineZoom)}px`,
                        borderRadius: '4px',
                        border: selectedNodeId === stickyNode.id
                          ? '1px solid #ffffff'
                          : '1px solid rgba(232, 157, 108, 0.3)',
                        background: selectedNodeId === stickyNode.id
                          ? 'rgba(232, 157, 108, 0.15)'
                          : 'rgba(232, 157, 108, 0.05)',
                        padding: '4px 8px',
                        cursor: textTrackLocked ? 'not-allowed' : 'pointer',
                        overflow: 'hidden',
                        userSelect: 'none',
                        transition: 'all 0.2s ease',
                        opacity: textTrackVisible ? 1 : 0.3
                      }}
                      title={`Connected Subtitle: ${stickyNode.name}`}
                    >
                      <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        background: 'rgba(232, 157, 108, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{ fontSize: '7px', fontWeight: 'bold', color: 'rgba(232, 157, 108, 0.9)' }}>T</span>
                      </div>
                      <span style={{ fontSize: '8px', fontWeight: '500', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {stickyNode.text ? stickyNode.text.split('\n')[0] : stickyNode.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Lane 3: Audio Track (A1) */}
              <div style={{
                height: '50px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}>
                {backgroundAudioTracks.map((node) => {
                  return (
                    <div 
                      key={node.id}
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        playUISound('click');
                      }}
                      onMouseDown={(e) => {
                        if (audioTrackLocked) return;
                        if (e.target.className && e.target.className.includes('timeline-trim-handle')) return;
                        
                        e.stopPropagation();
                        e.preventDefault();
                        
                        setSlidingAudio({
                          id: node.id,
                          initialX: e.clientX,
                          initialStart: node.timelineStart || 0
                        });
                        playUISound('click');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        height: '40px',
                        position: 'absolute',
                        left: `${(node.timelineStart || 0) * timelineZoom}px`,
                        width: `${Math.max(100, (node.endTime - node.startTime) * timelineZoom)}px`,
                        borderRadius: '4px',
                        border: selectedNodeId === node.id
                          ? '1px solid #ffffff'
                          : '1px solid var(--border-glass)',
                        background: selectedNodeId === node.id
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(163, 177, 155, 0.06)',
                        padding: '4px 10px',
                        cursor: audioTrackLocked ? 'not-allowed' : (slidingAudio && slidingAudio.id === node.id ? 'grabbing' : 'grab'),
                        opacity: audioTrackMuted ? 0.4 : 1,
                        transition: trimming || (slidingAudio && slidingAudio.id === node.id) ? 'none' : 'all 0.2s ease',
                        boxShadow: 'none',
                        overflow: 'hidden'
                      }}
                    >
                      {!audioTrackLocked && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setTrimming({
                              nodeId: node.id,
                              handle: 'left',
                              initialX: e.clientX,
                              initialValue: node.startTime
                            });
                            playUISound('click');
                          }}
                          className="timeline-trim-handle left"
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '5px',
                            height: '100%',
                            cursor: 'ew-resize',
                            background: 'rgba(232, 157, 108, 0.2)',
                            borderTopLeftRadius: '3px',
                            borderBottomLeftRadius: '3px',
                            borderRight: '1px solid rgba(232, 157, 108, 0.4)',
                            zIndex: 2
                          }}
                          title={`In: ${node.startTime.toFixed(1)}s`}
                        />
                      )}

                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        fontWeight: '700',
                        userSelect: 'none',
                        flexShrink: 0
                      }}>
                        <Music size={10} style={{ color: 'var(--accent-pink)' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, userSelect: 'none' }}>
                        <span style={{ fontSize: '9px', fontWeight: '500', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {node.name}
                        </span>
                        <span style={{ fontSize: '7px', color: 'var(--text-muted)' }}>
                          {(node.endTime - node.startTime).toFixed(1)}s • Audio
                        </span>
                      </div>

                      {!audioTrackLocked && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setTrimming({
                              nodeId: node.id,
                              handle: 'right',
                              initialX: e.clientX,
                              initialValue: node.endTime
                            });
                            playUISound('click');
                          }}
                          className="timeline-trim-handle right"
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            width: '5px',
                            height: '100%',
                            cursor: 'ew-resize',
                            background: 'rgba(232, 157, 108, 0.2)',
                            borderTopRightRadius: '3px',
                            borderBottomRightRadius: '3px',
                            borderLeft: '1px solid rgba(232, 157, 108, 0.4)',
                            zIndex: 2
                          }}
                          title={`Out: ${node.endTime.toFixed(1)}s`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vertical Playhead Scrubber Line */}
              <div style={{
                position: 'absolute',
                left: `${playheadTime * timelineZoom}px`,
                top: 0,
                bottom: 0,
                width: '1.5px',
                background: 'var(--accent-cyan)',
                zIndex: 30,
                pointerEvents: 'none',
                boxShadow: '0 0 6px var(--accent-cyan)',
                transition: isScrubbing ? 'none' : 'left 0.08s linear'
              }} />

            </div>
          </div>
        </div>
      </div>

      {/* Hidden background audio player for parallel audio tracks */}
      <audio ref={bgAudioRef} style={{ display: 'none' }} />

      {/* Fullscreen Presentation Mode Shield */}
      {isPresentationActive && activeNode && (
        <div 
          className="presentation-shield active"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: '#040508',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            userSelect: 'none'
          }}
        >
          {/* Top header navigation details */}
          <div 
            style={{
              position: 'absolute',
              top: '24px',
              left: '40px',
              right: '40px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 1000
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '18px', color: 'white' }}>
                {activeNode.name}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Slide {currentIndex + 1} of {sequence.length}
              </span>
            </div>
            
            <button 
              onClick={handleStopPresentation}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >
              <X size={16} />
            </button>
          </div>

          {/* Centered active presentation media container */}
          <div 
            className={`presentation-video-container ${activeTransition ? `${activeTransition}-transition` : ''}`}
            style={{
              ...getRatioSize(),
              '--trans-dur': `${activeTransDuration}s`
            }}
          >
            
            {/* VIDEO NODE PLAYBACK */}
            {activeNode.type === 'video' && (
              <video 
                ref={videoRef}
                src={activeNode.url}
                className="presentation-video"
                onTimeUpdate={handleVideoTimeUpdate}
                volume={activeNode.volume}
                style={{ filter: getFilterCss(activeNode.filter), opacity: videoTrackVisible ? 1 : 0 }}
                playsInline
                autoPlay
              />
            )}



            {/* IMAGE NODE PLAYBACK */}
            {activeNode.type === 'image' && (
              <img 
                src={activeNode.url} 
                alt={activeNode.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  filter: getFilterCss(activeNode.filter),
                  opacity: videoTrackVisible ? 1 : 0
                }}
              />
            )}
            
          </div>

          {/* Subtitles/Narrative block overlay */}
          {activeSubtitle && textTrackVisible && (
            <div className="presentation-subtitle">
              {activeSubtitle}
            </div>
          )}

          {/* Floating presentation controller bar */}
          <div 
            className="glass-panel"
            style={{
              position: 'absolute',
              bottom: '40px',
              display: 'flex',
              alignItems: 'center',
              padding: '10px 24px',
              borderRadius: '30px',
              gap: '20px',
              zIndex: 1000,
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <button 
              onClick={handlePrev}
              disabled={currentIndex === 0}
              style={{
                background: 'none',
                border: 'none',
                color: currentIndex === 0 ? 'var(--text-muted)' : 'white',
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <SkipBack size={16} fill="currentColor" />
            </button>

            <button 
              onClick={togglePlayback}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'white',
                border: 'none',
                color: 'black',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {isPlaying ? <Square size={16} fill="black" /> : <Play size={16} fill="black" />}
            </button>

            <button 
              onClick={handleNext}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              <SkipForward size={16} fill="currentColor" />
            </button>
          </div>

        </div>
      )}
    </>
  );
}
