const API_BASE = 'http://localhost:8000';

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showUnlock() {
  showPage('page-unlock');
  const app = document.getElementById('page-unlock');
  app.innerHTML = `
    <h2>Unlock System</h2>
    <div class="subtitle">Use your face to unlock access</div>
    <button id="unlock-btn">Unlock</button>
    <div id="unlock-capture" class="hidden">
      <video id="video" width="320" height="240" autoplay muted></video>
      <p>Capturing...</p>
    </div>
    <div id="unlock-result"></div>
    <a class="enroll-link" id="enroll-link">Register your face here</a>
  `;
  document.getElementById('unlock-btn').onclick = startUnlockCamera;
  document.getElementById('enroll-link').onclick = showEnroll;
}

function startUnlockCamera() {
  document.getElementById('unlock-btn').disabled = true;
  document.getElementById('unlock-capture').classList.remove('hidden');
  const video = document.getElementById('video');
  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    video.srcObject = stream;
    setTimeout(() => {
      captureUnlockPhoto(stream, video);
    }, 1500);
  });
}

function captureUnlockPhoto(stream, video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    stream.getTracks().forEach(track => track.stop());
    unlockAPI(blob);
  }, 'image/jpeg');
}

function unlockAPI(blob) {
  const resultDiv = document.getElementById('unlock-result');
  resultDiv.innerHTML = 'Processing...';
  const formData = new FormData();
  formData.append('image', blob, 'capture.jpg');
  fetch(`${API_BASE}/unlock`, {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(res => {
      if (res.status === 'ok') {
        document.getElementById('success-user').innerText = `Welcome, ${res.user}!`;
        showPage('page-success');
      } else {
        showPage('page-fail');
      }
    })
    .catch(() => {
      resultDiv.innerHTML = 'Error communicating with backend.';
    });
}

function showEnroll() {
  showPage('page-enroll');
  const app = document.getElementById('page-enroll');
  app.innerHTML = `
    <h2>Enroll New User</h2>
    <div class="subtitle">Add yourself to the system</div>
    <form id="enroll-form">
      <div>
        <label>Name: </label>
        <input id="enroll-name" required />
      </div>
      <div>
        <label>Photo: </label>
        <input type="file" id="enroll-file" accept="image/*" />
        <span> or </span>
        <button type="button" id="enroll-cam-btn">Capture from webcam</button>
      </div>
      <div id="enroll-capture" class="hidden">
        <video id="enroll-video" width="320" height="240" autoplay muted></video>
        <p>Capturing...</p>
      </div>
      <div>
        <button type="submit">Enroll</button>
      </div>
    </form>
    <div id="enroll-result"></div>
  `;
  let enrollBlob = null;
  document.getElementById('enroll-cam-btn').onclick = () => {
    document.getElementById('enroll-capture').classList.remove('hidden');
    const video = document.getElementById('enroll-video');
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      video.srcObject = stream;
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          stream.getTracks().forEach(track => track.stop());
          enrollBlob = blob;
        }, 'image/jpeg');
      }, 1500);
    });
  };
  document.getElementById('enroll-file').onchange = e => {
    enrollBlob = e.target.files[0];
  };
  document.getElementById('enroll-form').onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById('enroll-name').value;
    if (!name || !enrollBlob) {
      document.getElementById('enroll-result').innerHTML = 'Please provide a name and photo.';
      return;
    }
    enrollAPI(name, enrollBlob);
  };
}

function enrollAPI(name, blob) {
  document.getElementById('enroll-result').innerHTML = 'Processing...';
  fetch(`${API_BASE}/generate_enroll_link`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      const token = data.token;
      const formData = new FormData();
      formData.append('name', name);
      formData.append('image', blob, 'enroll.jpg');
      return fetch(`${API_BASE}/enroll/${token}`, {
        method: 'POST',
        body: formData
      });
    })
    .then(res => res.json())
    .then(res => {
      if (res.status === 'enrolled') {
        document.getElementById('enroll-result').innerHTML = `<h3>Enrollment successful! Welcome, ${res.name}.</h3>`;
      } else if (res.error) {
        document.getElementById('enroll-result').innerHTML = `<h3>Error: ${res.error}</h3>`;
      } else {
        document.getElementById('enroll-result').innerHTML = 'Unknown error.';
      }
    })
    .catch(() => {
      document.getElementById('enroll-result').innerHTML = 'Error communicating with backend.';
    });
}

// Initial load
window.onload = () => {
  showUnlock();
}; 