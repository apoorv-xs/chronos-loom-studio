import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderOpen, 
  Video, 
  Music, 
  Image as ImageIcon, 
  Search, 
  ArrowLeft, 
  UploadCloud, 
  ChevronRight,
  ChevronLeft,
  File,
  Volume2,
  VolumeX
} from 'lucide-react';
import { setMuteState, getMuteState, playUISound } from '../utils/audioSynth';

const MEDIA_EXTENSIONS = {
  video: ['mov', 'mp4', 'webm', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif']
};

export default function DirectoryExplorer({ 
  onFileDragStart, 
  onFolderDragStart, 
  activeFolderHandle,
  setActiveFolderHandle,
  isSidebarOpen,
  onCollapse
}) {
  const [rootHandle, setRootHandle] = useState(null);
  const [currentHandle, setCurrentHandle] = useState(null);
  const [pathHistory, setPathHistory] = useState([]); // [{ name, handle }]
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [muted, setMuted] = useState(getMuteState());
  const [error, setError] = useState('');
  const [mediaFilter, setMediaFilter] = useState('all');

  const handleToggleMute = (e) => {
    e.stopPropagation();
    const nextMuted = !muted;
    setMuted(nextMuted);
    setMuteState(nextMuted);
    if (!nextMuted) {
      playUISound('change');
    }
  };

  // Handle opening directory picker
  const handleOpenFolder = async () => {
    try {
      setError('');
      setIsLoading(true);
      const handle = await window.showDirectoryPicker();
      setRootHandle(handle);
      setCurrentHandle(handle);
      setActiveFolderHandle(handle);
      setPathHistory([{ name: handle.name, handle }]);
    } catch (err) {
      console.error(err);
      if (err.name !== 'AbortError') {
        setError('Failed to open directory. Make sure you are using Chrome, Edge, or Opera.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to determine media type from filename
  const getMediaType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (MEDIA_EXTENSIONS.video.includes(ext)) return 'video';
    if (MEDIA_EXTENSIONS.audio.includes(ext)) return 'audio';
    if (MEDIA_EXTENSIONS.image.includes(ext)) return 'image';
    return null;
  };

  // Read current directory contents
  const readDirectory = async (directoryHandle) => {
    if (!directoryHandle) return;
    setIsLoading(true);
    setError('');
    
    try {
      // Verify permission
      const options = { mode: 'read' };
      if (await directoryHandle.queryPermission(options) !== 'granted') {
        if (await directoryHandle.requestPermission(options) !== 'granted') {
          setError('Permission denied to read this folder.');
          setIsLoading(false);
          return;
        }
      }

      const folderList = [];
      const fileList = [];

      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'directory') {
          folderList.push(entry);
        } else if (entry.kind === 'file') {
          const type = getMediaType(entry.name);
          if (type) {
            fileList.push({
              handle: entry,
              name: entry.name,
              type: type
            });
          }
        }
      }

      // Sort alphabetically
      folderList.sort((a, b) => a.name.localeCompare(b.name));
      fileList.sort((a, b) => a.name.localeCompare(b.name));

      setFolders(folderList);
      setFiles(fileList);
    } catch (err) {
      console.error('Error reading directory:', err);
      setError('Error accessing directory contents.');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger read when current directory changes
  useEffect(() => {
    if (currentHandle) {
      readDirectory(currentHandle);
    }
  }, [currentHandle]);

  // Navigate into a subfolder
  const handleNavigateToFolder = (folderHandle) => {
    setCurrentHandle(folderHandle);
    setPathHistory([...pathHistory, { name: folderHandle.name, handle: folderHandle }]);
  };

  // Go back up one directory level
  const handleGoBack = () => {
    if (pathHistory.length === 1) {
      setRootHandle(null);
      setCurrentHandle(null);
      setPathHistory([]);
      setActiveFolderHandle(null);
      return;
    }
    if (pathHistory.length <= 1) return;
    const newHistory = [...pathHistory];
    newHistory.pop();
    setPathHistory(newHistory);
    setCurrentHandle(newHistory[newHistory.length - 1].handle);
  };

  // Click on path breadcrumb to navigate
  const handleBreadcrumbClick = (index) => {
    if (index === pathHistory.length - 1) return;
    const newHistory = pathHistory.slice(0, index + 1);
    setPathHistory(newHistory);
    setCurrentHandle(newHistory[newHistory.length - 1].handle);
  };

  // Filter lists based on search query and active media filter
  const filteredFolders = mediaFilter === 'all'
    ? folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  
  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (mediaFilter === 'all' || f.type === mediaFilter)
  );

  // Return file icon based on media type
  const getFileIcon = (type) => {
    switch (type) {
      case 'video': return <Video size={16} className="text-cyan-400" style={{ color: 'var(--accent-cyan)' }} />;
      case 'audio': return <Music size={16} className="text-pink-400" style={{ color: 'var(--accent-pink)' }} />;
      case 'image': return <ImageIcon size={16} className="text-purple-400" style={{ color: 'var(--accent-purple)' }} />;
      default: return <File size={16} className="text-gray-400" />;
    }
  };

  // Render breadcrumb path location bar
  const renderLocationBar = () => {
    if (pathHistory.length === 0) return null;
    return (
      <div 
        className="location-bar" 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-glass)',
          fontSize: '11px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          color: 'var(--text-secondary)'
        }}
      >
        {pathHistory.length >= 1 && (
          <button 
            onClick={handleGoBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              paddingRight: '6px',
              borderRight: '1px solid var(--border-glass)'
            }}
            title={pathHistory.length === 1 ? "Disconnect Folder" : "Go up a directory"}
          >
            <ArrowLeft size={12} />
          </button>
        )}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '4px' }}>
          {pathHistory.map((node, index) => (
            <React.Fragment key={index}>
              {index > 0 && <ChevronRight size={10} style={{ opacity: 0.3 }} />}
              <span 
                onClick={() => handleBreadcrumbClick(index)}
                style={{
                  cursor: index === pathHistory.length - 1 ? 'default' : 'pointer',
                  fontWeight: index === pathHistory.length - 1 ? '500' : '400',
                  color: index === pathHistory.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  textDecoration: index === pathHistory.length - 1 ? 'none' : 'hover'
                }}
              >
                {node.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="sidebar glass-panel" 
      style={{ 
        userSelect: 'none',
        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-300px)',
        opacity: isSidebarOpen ? 1 : 0,
        pointerEvents: isSidebarOpen ? 'auto' : 'none'
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <h2 className="logo-title" style={{ margin: 0, fontSize: '15px', letterSpacing: '0.5px' }}>
          <FolderOpen size={16} style={{ color: 'var(--accent-blue)' }} />
          CHRONOS // Loom Studio
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={handleToggleMute}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={muted ? "Unmute UI sounds" : "Mute UI sounds"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button 
            onClick={onCollapse}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Collapse Sidebar"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {renderLocationBar()}

      {currentHandle ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Search bar & Media Tag filters */}
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border-glass)' }}>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Search folders & media..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '8px 12px 8px 32px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
              />
              <Search 
                size={14} 
                style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--text-muted)' 
                }} 
              />
            </div>
            
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', padding: '2px 0' }}>
              {[
                { label: 'All', value: 'all' },
                { label: 'Videos', value: 'video' },
                { label: 'Audios', value: 'audio' },
                { label: 'Images', value: 'image' }
              ].map(opt => {
                const isActive = mediaFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setMediaFilter(opt.value);
                      playUISound('change');
                    }}
                    style={{
                      background: isActive ? 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)' : 'rgba(255, 255, 255, 0.03)',
                      border: isActive ? 'none' : '1px solid var(--border-glass)',
                      borderRadius: '12px',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      fontSize: '10px',
                      fontWeight: isActive ? '600' : '400',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directory Explorer Listings */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Scanning directory...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                
                {/* Render Folders */}
                {filteredFolders.map((folder) => (
                  <div 
                    key={folder.name}
                    className="folder-item"
                    onClick={() => handleNavigateToFolder(folder)}
                    draggable
                    onDragStart={(e) => onFolderDragStart(e, folder)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: 'background 0.2s ease',
                      border: '1px solid transparent',
                      background: 'rgba(255, 255, 255, 0.01)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.borderColor = 'var(--border-glass)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <Folder size={16} className="text-yellow-500" style={{ color: 'var(--accent-orange)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {folder.name}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Folder</span>
                  </div>
                ))}

                {/* Render Media Files */}
                {filteredFiles.map((file) => (
                  <div 
                    key={file.name}
                    className="file-item"
                    draggable
                    onDragStart={(e) => onFileDragStart(e, file)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'grab',
                      fontSize: '13px',
                      transition: 'background 0.2s ease',
                      border: '1px solid transparent',
                      background: 'rgba(255, 255, 255, 0.02)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.borderColor = 'var(--border-glass)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    {getFileIcon(file.type)}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {file.name}
                    </span>
                    <span style={{ 
                      fontSize: '9px', 
                      padding: '2px 4px', 
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-muted)'
                    }}>
                      {file.type}
                    </span>
                  </div>
                ))}

                {filteredFolders.length === 0 && filteredFiles.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No directories or media files found in this folder.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div 
          style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center'
          }}
        >
          <div 
            style={{ 
              width: '80px', 
              height: '80px', 
              borderRadius: '24px', 
              background: 'rgba(59, 130, 246, 0.05)', 
              border: '1px dashed rgba(59, 130, 246, 0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: '20px',
              color: 'var(--accent-blue)',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.05)'
            }}
          >
            <UploadCloud size={36} />
          </div>
          
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
            No Folder Loaded
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
            Select a directory on your machine containing video, audio, or image files to begin.
          </p>

          <button 
            onClick={handleOpenFolder}
            style={{
              background: 'linear-gradient(135deg, rgba(232, 157, 108, 0.15) 0%, rgba(200, 184, 138, 0.08) 100%)',
              border: '1px solid var(--border-glass-glow)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)',
              transition: 'transform 0.2s ease, background-color 0.2s, box-shadow 0.2s, border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232, 157, 108, 0.25) 0%, rgba(200, 184, 138, 0.12) 100%)';
              e.currentTarget.style.borderColor = 'rgba(232, 157, 108, 0.6)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(232, 157, 108, 0.35)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232, 157, 108, 0.15) 0%, rgba(200, 184, 138, 0.08) 100%)';
              e.currentTarget.style.borderColor = 'var(--border-glass-glow)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Open Folder
          </button>
          
          {error && (
            <p style={{ marginTop: '16px', fontSize: '12px', color: 'red', lineHeight: '1.4' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
