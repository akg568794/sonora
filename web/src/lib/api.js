async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const fetchTracks = () => request('/api/tracks').then((b) => b.tracks ?? []);

export const fetchRooms = () => request('/api/rooms').then((b) => b.rooms ?? []);

export const deleteTrack = (id) => request(`/api/tracks/${id}`, { method: 'DELETE' });

/**
 * XHR rather than fetch, because upload progress is the whole point of the
 * drop-zone UI and fetch still can't report it.
 */
export function uploadTracks({ files, user, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    form.append('userId', user.id);
    form.append('userName', user.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/tracks');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ tracks: body.tracks ?? [], failed: body.failed ?? [] });
      } else {
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — is the server running?'));
    xhr.send(form);
  });
}
