import React, { useEffect, useRef, useState } from 'react';
import { StickyNote, Plus, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';

const STORAGE_KEY = 'elite-chocolate-notepad';

export const DEFAULT_FIREBASE_NOTE = {
  id: 'note-firebase-config-default',
  title: '🔒 Firebase Cloud Vault Credentials & Links',
  body: `FIREBASE CLOUD BACKUP VAULT — PRODUCTION INFO
=============================================================

Firebase Console URL:
https://console.firebase.google.com/project/my-business-8aadb/settings/general/web:YjEwNDJkMTctYmE3Zi00MDVhLTliZWQtMWIwZmZjYWQ1ZTYy

Project Details:
- Project Name: My-Business
- Project ID: my-business-8aadb
- Database Type: Cloud Firestore Database
- Region: Singapore (asia-southeast1)

Production API Credentials (Preset in Source Code):
- apiKey: AIzaSyB1jcDCpb0FLy4mHePNLutnlGDBFyAUfIA
- authDomain: my-business-8aadb.firebaseapp.com
- databaseURL: https://my-business-8aadb-default-rtdb.asia-southeast1.firebasedatabase.app
- projectId: my-business-8aadb
- storageBucket: my-business-8aadb.firebasestorage.app
- messagingSenderId: 1035521814001
- appId: 1:1035521814001:web:a13c2e6888bbe97c88a850
- measurementId: G-XLK87ECCMC

Key Features & Behavior:
------------------------
1. Default Setup: Active out-of-the-box on every app update or build.
2. Vault ID: Defaults to Company Phone (e.g. 03337669709).
3. Security PIN: Defaults to Staff PIN (e.g. 1234).
4. Restore: 1-click download on any phone, tablet, or PC to restore 100% of your data.`,
  updated_at: '2026-08-23T00:00:00.000Z',
};

function loadNotes() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let list = Array.isArray(rows) ? rows : [];
    if (!list.some((n) => n.id === DEFAULT_FIREBASE_NOTE.id)) {
      list.unshift(DEFAULT_FIREBASE_NOTE);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return [DEFAULT_FIREBASE_NOTE];
  }
}

function persistNotes(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function previewOf(body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Empty';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export default function NotepadPanel() {
  const toast = useToast();
  const [notes, setNotes] = useState(() =>
    loadNotes().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  );
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [covered, setCovered] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const saveTimer = useRef(null);
  const skipSave = useRef(true);
  const current = currentId == null ? null : { id: currentId };

  const writeNotes = (rows) => {
    const next = [...rows].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    persistNotes(next);
    setNotes(next);
    return next;
  };

  const openNote = (note) => {
    skipSave.current = true;
    setCurrentId(note.id);
    setTitle(note.title || '');
    setBody(note.body || '');
    setCovered(false);
    setSaveState('');
  };

  const startNew = () => {
    skipSave.current = true;
    setCurrentId('new');
    setTitle('');
    setBody('');
    setCovered(false);
    setSaveState('');
  };

  const backToList = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    skipSave.current = true;
    setCurrentId(null);
    setCovered(false);
    setNotes(loadNotes().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))));
  };

  useEffect(() => {
    if (currentId == null) return undefined;
    if (skipSave.current) {
      skipSave.current = false;
      return undefined;
    }
    setSaveState('Saving…');
    saveTimer.current = setTimeout(() => {
      const nextTitle = title.trim() || 'Untitled';
      const now = new Date().toISOString();
      if (!title.trim() && !String(body).trim()) {
        setSaveState('');
        return;
      }
      const rows = loadNotes();
      if (currentId === 'new') {
        const id = Date.now();
        rows.unshift({ id, title: nextTitle, body, created_at: now, updated_at: now });
        writeNotes(rows);
        skipSave.current = true;
        setCurrentId(id);
      } else {
        const idx = rows.findIndex((n) => String(n.id) === String(currentId));
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], title: nextTitle, body, updated_at: now };
        } else {
          rows.unshift({ id: currentId, title: nextTitle, body, created_at: now, updated_at: now });
        }
        writeNotes(rows);
      }
      setSaveState('Saved');
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, body, currentId]);

  const confirmDelete = () => {
    const id = pendingDelete?.id;
    setPendingDelete(null);
    if (id == null || id === 'new') {
      backToList();
      return;
    }
    writeNotes(loadNotes().filter((n) => String(n.id) !== String(id)));
    toast.success('Note deleted');
    skipSave.current = true;
    setCurrentId(null);
  };

  if (current) {
    return (
      <div className="panel-flat notepad-panel">
        <div className="panel-flat-head">
          <div>
            <h3 className="panel-flat-title">
              <StickyNote size={17} /> {currentId === 'new' ? 'New note' : 'Note'}
            </h3>
            <p className="panel-flat-sub">
              {saveState || 'Write something to memorize. Saved on this device.'}
            </p>
          </div>
          <div className="notepad-head-actions">
            <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={backToList}>
              <ChevronLeft size={14} /> All notes
            </button>
            {currentId !== 'new' ? (
              <button
                type="button"
                className="btn-danger"
                style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                onClick={() => setPendingDelete({ id: currentId })}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <label className="form-label" htmlFor="notepad-title">Title</label>
        <input
          id="notepad-title"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Bank details, Al-Fatah mix"
          autoComplete="off"
        />

        <div className="notepad-cover-bar">
          <span className="form-label" style={{ margin: 0 }}>Note</span>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minHeight: 32, padding: '0.3rem 0.65rem', fontSize: '0.72rem' }}
            onClick={() => setCovered((v) => !v)}
          >
            {covered ? <Eye size={13} /> : <EyeOff size={13} />}
            {covered ? 'Show' : 'Cover to memorize'}
          </button>
        </div>

        {covered ? (
          <button type="button" className="notepad-cover" onClick={() => setCovered(false)}>
            <EyeOff size={22} />
            <strong>Covered</strong>
            <span>Try to recall it, then tap to reveal</span>
          </button>
        ) : (
          <textarea
            className="form-textarea notepad-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the line, number, or list you want to remember…"
            rows={12}
          />
        )}

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete this note?"
          message="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    );
  }

  return (
    <div className="panel-flat notepad-panel">
      <div className="panel-flat-head">
        <div>
          <h3 className="panel-flat-title">
            <StickyNote size={17} /> Notepad
          </h3>
          <p className="panel-flat-sub">Personal notes to memorize. Cover them, then try to recall.</p>
        </div>
        <button type="button" className="btn-primary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.85rem', fontSize: '0.8rem' }} onClick={startNew}>
          <Plus size={15} /> New note
        </button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          body="Write a number, mix, or reminder. Use Cover to practice from memory."
          actionLabel="Write a note"
          onAction={startNew}
        />
      ) : (
        <div className="notepad-list">
          {notes.map((note) => (
            <button key={note.id} type="button" className="notepad-row" onClick={() => openNote(note)}>
              <span className="notepad-row-copy">
                <strong>{note.title || 'Untitled'}</strong>
                <small>{previewOf(note.body)}</small>
              </span>
              <ChevronRight size={16} className="notepad-row-chevron" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
