import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Database, Cloud, Zap, Eye, EyeOff, Check, X } from './googleIcons';
import { getSettings, saveSettings, CLOUD_PROVIDERS, LOCAL_MODELS } from './aiService';
import { getCursorSettings, saveCursorSettings, CURSOR_SIZES } from './cursorManager';

const Settings = () => {
  const navigate = useNavigate();
  const currentSettings = getSettings();
  const cleanedInitialKey = currentSettings.apiKey === 'google_oauth' ? '' : (currentSettings.apiKey || '');
  const initialBgStyle = localStorage.getItem('arka-bg-style') || 'dotted';
  const initialBgColor = localStorage.getItem('arka-bg-color') || '#f5f5f5';
  const initialChatMode = currentSettings.chatDisplayMode || 'overlay';

  const [providerType, setProviderType] = useState(currentSettings.providerType || 'cloud');
  const [cloudProvider, setCloudProvider] = useState(currentSettings.cloudProvider || 'gemini');
  const [cloudModel, setCloudModel] = useState(currentSettings.cloudModel || 'gemini-2.5-flash');
  const [apiKey, setApiKey] = useState(cleanedInitialKey);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [localUrl, setLocalUrl] = useState(currentSettings.localUrl || 'http://localhost:11434');
  const [localModel, setLocalModel] = useState(currentSettings.localModel || '');
  const [saved, setSaved] = useState(false);
  const [savedModel, setSavedModel] = useState(
    currentSettings.providerType === 'cloud' ? currentSettings.cloudModel : currentSettings.localModel
  );
  const [initialSettings, setInitialSettings] = useState({
    ...currentSettings,
    apiKey: cleanedInitialKey,
    bgStyle: initialBgStyle,
    bgColor: initialBgColor,
    chatDisplayMode: initialChatMode
  });
  const [bgStyle, setBgStyle] = useState(initialBgStyle);
  const [bgColor, setBgColor] = useState(initialBgColor);
  const [chatDisplayMode, setChatDisplayMode] = useState(initialChatMode);
  const [cursorSettings, setCursorSettings] = useState(() => getCursorSettings());

  const handleCursorSizeChange = (size) => {
    const next = { ...cursorSettings, size };
    setCursorSettings(next);
    saveCursorSettings(next);
  };

  useEffect(() => {
    if (currentSettings.apiKey === 'google_oauth') {
      saveSettings({ ...currentSettings, apiKey: '' });
    }
  }, []);

  const cardStyle = {
    background: '#ffffff',
    borderRadius: '1.25rem',
    border: '1px solid #e5e7eb',
    padding: '2rem',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
    marginBottom: '1.5rem',
  };
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' };
  const tabBtn = (active) => ({
    flex: 1, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    borderRadius: '0.75rem', border: active ? '2px solid #000' : '1px solid #e5e7eb',
    background: active ? '#f8fafc' : 'transparent', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
    fontFamily: 'var(--font-sans)', color: '#000', transition: 'all 0.2s'
  });

  const activeProviderModels = CLOUD_PROVIDERS[cloudProvider]?.models || [];

  const handleSave = () => {
    if (!providerType) {
      alert('Select Cloud API or Local AI first.');
      return;
    }
    
    let finalApiKey = apiKey;
    if (providerType === 'cloud') {
      if (!cloudProvider || !cloudModel) {
        alert('Select a cloud provider and model.');
        return;
      }
      if (!finalApiKey.trim() || finalApiKey === 'google_oauth') {
        alert('Please enter a valid API key.');
        return;
      }
    }
    
    if (providerType === 'local' && !localModel) {
      alert('Select a local AI model.');
      return;
    }
    
    const newSettings = { 
      providerType, 
      cloudProvider, 
      cloudModel, 
      apiKey: finalApiKey, 
      localUrl, 
      localModel,
      chatDisplayMode
    };
    saveSettings(newSettings);

    // Save background & chat layout preferences
    localStorage.setItem('arka-bg-style', bgStyle);
    localStorage.setItem('arka-bg-color', bgColor);
    localStorage.setItem('arka_chat_display_mode', chatDisplayMode);
    try {
      window.dispatchEvent(new Event('arka_settings_updated'));
    } catch (e) {}

    setSavedModel(providerType === 'cloud' ? cloudModel : localModel);
    setSaved(true);
    setTimeout(() => {
      setInitialSettings({
        ...newSettings,
        bgStyle,
        bgColor,
        chatDisplayMode
      });
      setSaved(false);
    }, 1000);
  };

  const isProviderDirty = initialSettings && (
    providerType !== initialSettings.providerType ||
    cloudProvider !== initialSettings.cloudProvider ||
    cloudModel !== initialSettings.cloudModel ||
    apiKey !== initialSettings.apiKey ||
    localUrl !== initialSettings.localUrl ||
    localModel !== initialSettings.localModel
  );

  const isBgDirty = initialSettings && (
    bgStyle !== initialSettings.bgStyle ||
    bgColor !== initialSettings.bgColor
  );

  const isChatModeDirty = initialSettings && (
    chatDisplayMode !== initialSettings.chatDisplayMode
  );

  const handleBackClick = () => {
    if (isProviderDirty || isBgDirty || isChatModeDirty) {
      setShowUnsavedModal(true);
    } else {
      navigate(-1);
    }
  };

  return (
    <div style={{ height: '100vh', background: '#f5f5f5', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4rem', paddingBottom: '4rem' }}>
      <div style={{ width: '100%', maxWidth: '640px', padding: '0 1rem' }}>

        {/* Back */}
        <button onClick={handleBackClick} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer', marginBottom: '1.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
          <ChevronLeft size={18} /> Back
        </button>

        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', color: '#000' }}>Settings</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '2rem', fontFamily: 'var(--font-mono)' }}>Configure your AI model and diagram studio preferences.</p>

        {/* ─── Provider Selection ─── */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>AI Provider</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
            Bring your own API key or run models locally. Your key stays in your browser — never sent to our servers.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button onClick={() => setProviderType('cloud')} style={tabBtn(providerType === 'cloud')}>
              <Cloud size={16} /> Cloud API
            </button>
            <button onClick={() => setProviderType('local')} style={tabBtn(providerType === 'local')}>
              <Database size={16} /> Local
            </button>
          </div>

          {/* ─── Cloud API ─── */}
          {providerType === 'cloud' && (
            <>
              {/* Cloud Provider Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Provider</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {Object.entries(CLOUD_PROVIDERS).map(([key, prov]) => (
                    <button key={key} onClick={() => { setCloudProvider(key); setCloudModel(''); setSavedModel(null); }} style={{
                      flex: 1, padding: '0.6rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 600,
                      border: cloudProvider === key ? '2px solid #000' : '1px solid #e5e7eb',
                      background: cloudProvider === key ? '#f0f0f0' : '#fff', cursor: 'pointer', fontFamily: 'var(--font-sans)', color: '#000'
                    }}>
                      {prov.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Model</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {activeProviderModels.map(m => (
                    <button key={m.id} onClick={() => setCloudModel(m.id)} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.85rem',
                      borderRadius: '0.6rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                      border: cloudModel === m.id ? '2px solid #000' : (savedModel === m.id ? '2px solid #06b6d4' : '1px solid #e5e7eb'),
                      background: savedModel === m.id ? '#cffafe' : (cloudModel === m.id ? '#f8fafc' : '#fff'), fontFamily: 'var(--font-sans)',
                      outline: 'none'
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: cloudModel === m.id ? '5px solid #000' : (savedModel === m.id ? '5px solid #06b6d4' : '2px solid #d1d5db'), flexShrink: 0, transition: 'all 0.15s' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {m.label}
                          {m.badge && (
                            <span style={{
                              fontSize: '0.65rem',
                              background: m.badge === 'Recommended' ? '#dcfce7' : (m.badge === 'Latest' ? '#f1f5f9' : (m.badge === 'Fast' ? '#eff6ff' : (m.badge === 'Reasoning' ? '#f5f3ff' : '#f3f4f6'))),
                              color: m.badge === 'Recommended' ? '#166534' : (m.badge === 'Latest' ? '#475569' : (m.badge === 'Fast' ? '#1d4ed8' : (m.badge === 'Reasoning' ? '#6d28d9' : '#374151'))),
                              border: m.badge === 'Recommended' ? '1px solid #bbf7d0' : (m.badge === 'Latest' ? '1px solid #cbd5e1' : (m.badge === 'Fast' ? '1px solid #bfdbfe' : (m.badge === 'Reasoning' ? '1px solid #ddd6fe' : '1px solid #e5e7eb'))),
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700
                            }}>
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {cloudModel.includes('combo') && (
                <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '0.5rem', border: '1px solid #bbf7d0', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#166534', lineHeight: 1.5 }}>
                  <strong>💡 Combo advantage:</strong> Combos use a fast model for classification (cheaper, faster) and a powerful model for generation (higher quality). This saves tokens and gives you the best of both worlds.
                </div>
              )}

              {/* API Key Input */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={labelStyle}>API Key</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={
                      cloudProvider === 'gemini' ? 'AIzaSy...' :
                      cloudProvider === 'openai' ? 'sk-...' :
                      cloudProvider === 'anthropic' ? 'sk-ant-...' :
                      cloudProvider === 'groq' ? 'gsk_...' :
                      cloudProvider === 'openrouter' ? 'sk-or-...' :
                      cloudProvider === 'mistral' ? '...' :
                      cloudProvider === 'sarvam' ? '...' :
                      'Paste your API key'
                    }
                    style={{ ...inputStyle, paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                  Keys stored locally in browser via localStorage.
                </p>
              </div>
            </>
          )}

          {/* ─── Local Model ─── */}
          {providerType === 'local' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Ollama Server URL</label>
                <input
                  type="text"
                  value={localUrl}
                  onChange={e => setLocalUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Select Local Model</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {LOCAL_MODELS.map(m => (
                    <button key={m.id} onClick={() => setLocalModel(m.id)} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.85rem',
                      borderRadius: '0.6rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                      border: localModel === m.id ? '2px solid #2563eb' : (savedModel === m.id ? '2px solid #06b6d4' : (m.isOfficial ? '1px solid #bfdbfe' : '1px solid #e5e7eb')),
                      background: savedModel === m.id ? '#cffafe' : (localModel === m.id ? '#eff6ff' : (m.isOfficial ? '#f8fafc' : '#fff')), fontFamily: 'var(--font-sans)',
                      outline: 'none'
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: localModel === m.id ? '5px solid #2563eb' : (savedModel === m.id ? '5px solid #06b6d4' : '2px solid #d1d5db'), flexShrink: 0, transition: 'all 0.15s' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {m.label}
                          <span style={{ fontSize: '0.65rem', background: m.isOfficial ? '#dbeafe' : '#e2e8f0', color: m.isOfficial ? '#1e40af' : '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{m.size}</span>
                          {m.isOfficial && (
                            <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, border: '1px solid #fcd34d' }}>
                              ★ Official
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Local Save Button for AI Provider */}
          <div style={{
            height: isProviderDirty ? '52px' : '0px',
            marginTop: isProviderDirty ? '1.5rem' : '0px',
            opacity: isProviderDirty ? 1 : 0,
            transform: isProviderDirty ? 'scale(1)' : 'scale(0.85)',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            overflow: 'hidden',
            pointerEvents: isProviderDirty ? 'auto' : 'none',
            width: '100%'
          }}>
            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '0.9rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.95rem',
                background: '#000', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', opacity: saved ? 0.7 : 1,
              }}
            >
              {saved ? <><Check size={18} /> Saved!</> : 'Save AI Provider Settings'}
            </button>
          </div>
        </div>



        {/* ─── Canvas Background ─── */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Canvas Background</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
            Customize the look of the drawing workspace to suit your preferences.
          </p>

          {/* Background Style */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Background Style</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setBgStyle('dotted');
                  if (bgColor === '#d9d9d9') {
                    setBgColor('#f5f5f5');
                  }
                }}
                style={tabBtn(bgStyle === 'dotted')}
              >
                Dotted
              </button>
              <button onClick={() => setBgStyle('plain')} style={tabBtn(bgStyle === 'plain')}>
                Plain
              </button>
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label style={labelStyle}>Background Color</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { val: '#ffffff', name: 'Pure White' },
                { val: '#f5f5f5', name: 'Cool Off-White' },
                ...(bgStyle === 'plain' ? [{ val: '#d9d9d9', name: 'Light Silver' }] : [])
              ].map(color => {
                const active = bgColor === color.val;
                return (
                  <button key={color.val} onClick={() => setBgColor(color.val)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.85rem',
                    borderRadius: '0.6rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                    border: active ? '2px solid #000' : '1px solid #e5e7eb',
                    background: active ? '#f8fafc' : '#fff', fontFamily: 'var(--font-sans)',
                    outline: 'none', width: '100%'
                  }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid #d1d5db', backgroundColor: color.val, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: active ? 700 : 600, color: active ? '#000' : '#475569', flex: 1 }}>{color.name}</span>
                    {active && <Check size={16} style={{ color: '#000' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Local Save Button for Canvas Background */}
          <div style={{
            height: isBgDirty ? '52px' : '0px',
            marginTop: isBgDirty ? '1.5rem' : '0px',
            opacity: isBgDirty ? 1 : 0,
            transform: isBgDirty ? 'scale(1)' : 'scale(0.85)',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            overflow: 'hidden',
            pointerEvents: isBgDirty ? 'auto' : 'none',
            width: '100%'
          }}>
            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '0.9rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.95rem',
                background: '#000', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', opacity: saved ? 0.7 : 1,
              }}
            >
              {saved ? <><Check size={18} /> Saved!</> : 'Save Background Settings'}
            </button>
          </div>
        </div>

        {/* ─── Agent Chat Layout ─── */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Agent Chat Display Mode</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
            Choose how the AI agent chat window displays when opened during diagram editing.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => setChatDisplayMode('overlay')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem',
                borderRadius: '0.75rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                border: chatDisplayMode === 'overlay' ? '2px solid #000' : '1px solid #e5e7eb',
                background: chatDisplayMode === 'overlay' ? '#f8fafc' : '#fff', fontFamily: 'var(--font-sans)',
                outline: 'none', width: '100%'
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '8px', background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#000">
                  <path d="M120-200v-560h720v560H120Zm480-80h200v-400H600v400ZM200-280h320v-400H200v400Z"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#000' }}>Overlay Drawer</span>
                  <span style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: '99rem', background: '#e2e8f0', color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Default</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Slides in as a floating drawer on top of the canvas layout.</div>
              </div>
              {chatDisplayMode === 'overlay' && <Check size={18} style={{ color: '#000' }} />}
            </button>

            <button
              onClick={() => setChatDisplayMode('push')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem',
                borderRadius: '0.75rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                border: chatDisplayMode === 'push' ? '2px solid #000' : '1px solid #e5e7eb',
                background: chatDisplayMode === 'push' ? '#f8fafc' : '#fff', fontFamily: 'var(--font-sans)',
                outline: 'none', width: '100%'
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '8px', background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#000">
                  <path d="M120-200v-560h720v560H120Zm560-80h80v-400H680v400ZM200-280h400v-400H200v400Z"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#000' }}>Push Drawer</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Squeezes canvas left so top & bottom toolbars stay fully side-by-side.</div>
              </div>
              {chatDisplayMode === 'push' && <Check size={18} style={{ color: '#000' }} />}
            </button>
          </div>

          {/* Local Save Button for Agent Chat Mode */}
          <div style={{
            height: isChatModeDirty ? '52px' : '0px',
            marginTop: isChatModeDirty ? '1.5rem' : '0px',
            opacity: isChatModeDirty ? 1 : 0,
            transform: isChatModeDirty ? 'scale(1)' : 'scale(0.85)',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            overflow: 'hidden',
            pointerEvents: isChatModeDirty ? 'auto' : 'none',
            width: '100%'
          }}>
            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '0.9rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.95rem',
                background: '#000', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', opacity: saved ? 0.7 : 1,
              }}
            >
              {saved ? <><Check size={18} /> Saved!</> : 'Save Agent Chat Settings'}
            </button>
          </div>
        </div>

        {/* ─── ARKA Unified Dynamic Cursor Suite ─── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: 0 }}>Cursor</h2>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '9999px',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>
              Beta
            </span>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1.25rem', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
            Adjust the cursor size across the ARKA workspace.
          </p>

          {/* Size Selector */}
          <div>
            <label style={labelStyle}>Cursor Size</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {CURSOR_SIZES.map((sz) => {
                const active = cursorSettings.size === sz.id;
                return (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => handleCursorSizeChange(sz.id)}
                    style={{
                      padding: '0.75rem 0.5rem',
                      borderRadius: '0.65rem',
                      border: active ? '2px solid #000' : '1px solid #e5e7eb',
                      background: active ? '#f8fafc' : '#fff',
                      fontWeight: active ? 700 : 500,
                      fontSize: '0.8rem',
                      color: active ? '#000' : '#475569',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'var(--cursor-pointer, pointer)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{sz.label}</span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{sz.px}px</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>


      </div>

      {/* Unsaved Changes Modal */}
      <AnimatePresence>
        {showUnsavedModal && (
          <motion.div
            style={{
              position: 'fixed', inset: 0, zIndex: 6000,
              background: 'rgba(0, 0, 0, 0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowUnsavedModal(false)}
          >
            <motion.div
              style={{
                background: '#fff', borderRadius: '1.25rem', padding: '2rem',
                width: '100%', maxWidth: '400px', margin: '0 1.5rem',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e5e7eb'
              }}
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ type: 'spring', duration: 0.28, bounce: 0.08 }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.75rem', color: '#000', fontFamily: 'var(--font-sans)' }}>
                Unsaved Changes
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.6, marginBottom: '1.5rem', fontFamily: 'var(--font-sans)' }}>
                You have unsaved changes. Would you like to save them before leaving?
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    setShowUnsavedModal(false);
                    navigate(-1);
                  }}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.9rem',
                    background: '#fff', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    textAlign: 'center', transition: 'all 0.15s'
                  }}
                >
                  Discard
                </button>
                <button
                  onClick={() => {
                    handleSave();
                    setShowUnsavedModal(false);
                    setTimeout(() => {
                      navigate(-1);
                    }, 1100);
                  }}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.9rem',
                    background: '#000', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    textAlign: 'center', transition: 'all 0.15s'
                  }}
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
