import { db, storage } from "./firebase";
import {
  ref, set, get, remove, onValue, off, push, serverTimestamp, update
} from "firebase/database";
import {
  ref as sRef, uploadString, getDownloadURL, deleteObject
} from "firebase/storage";

// ─── Realtime Database helpers ───

export const dbGet = async (path) => {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
};

export const dbSet = async (path, value) => {
  await set(ref(db, path), value);
};

export const dbUpdate = async (path, value) => {
  await update(ref(db, path), value);
};

export const dbRemove = async (path) => {
  await remove(ref(db, path));
};

export const dbPush = async (path, value) => {
  const r = push(ref(db, path), value);
  return r.key;
};

export const dbListen = (path, cb) => {
  const r = ref(db, path);
  onValue(r, snap => cb(snap.exists() ? snap.val() : null));
  return () => off(r);
};

// ─── Storage helpers (for images / profile photos) ───

export const uploadDataURL = async (storagePath, dataURL) => {
  const r = sRef(storage, storagePath);
  await uploadString(r, dataURL, "data_url");
  return await getDownloadURL(r);
};

export const deleteFile = async (storagePath) => {
  try { await deleteObject(sRef(storage, storagePath)); } catch {}
};
