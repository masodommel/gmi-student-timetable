const SEARCH_QUERY =
  'subject:"Timetables & Rescheduling" has:attachment filename:*.dav newer_than:60d ' +
  '-label:TimetableSynced -label:TimetableFailed';
const SYNCED_LABEL = 'TimetableSynced';
const FAILED_LABEL = 'TimetableFailed';
const MAX_THREADS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SOURCE_DIR = 'sources';

function syncDavAttachmentToGithub() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    Logger.log('Timetable sync is already running.');
    return;
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const token = properties.getProperty('GITHUB_TOKEN');
    const owner = properties.getProperty('REPO_OWNER');
    const repo = properties.getProperty('REPO_NAME');
    const branch = properties.getProperty('REPO_BRANCH') || 'main';

    if (!token || !owner || !repo)
      throw new Error('Set GITHUB_TOKEN, REPO_OWNER and REPO_NAME in Script Properties.');

    const syncedLabel = getOrCreateLabel(SYNCED_LABEL);
    const failedLabel = getOrCreateLabel(FAILED_LABEL);
    const threads = GmailApp.search(SEARCH_QUERY, 0, MAX_THREADS);
    let committed = 0;
    let failures = 0;

    for (const thread of threads) {
      let threadOk = true;
      let permanent = false;

      for (const message of thread.getMessages()) {
        for (const attachment of message.getAttachments()) {
          const name = attachment.getName() || '';
          if (!name.toLowerCase().endsWith('.dav')) continue;

          try {
            const result = syncAttachment(owner, repo, branch, token, message, attachment, name);
            committed += result.committed;
            if (!result.ok) {
              threadOk = false;
              failures += 1;
              if (result.permanent) permanent = true;
            }
          } catch (error) {
            threadOk = false;
            failures += 1;
            Logger.log(`Failed to sync ${name}: ${error && error.stack ? error.stack : error}`);
          }
        }
      }

      if (threadOk) {
        thread.addLabel(syncedLabel);
        thread.markRead();
      } else if (permanent) {
        thread.addLabel(failedLabel);
        thread.markRead();
      }
    }

    Logger.log(`Committed ${committed} file(s); ${failures} failure(s).`);
    if (failures) throw new Error(`Timetable sync had ${failures} failure(s). See the execution log.`);
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function syncAttachment(owner, repo, branch, token, message, attachment, name) {
  const bytes = attachment.getBytes();
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    Logger.log(`Skipping ${name}: ${bytes.length} bytes exceeds the limit.`);
    return { ok: false, committed: 0, permanent: true };
  }

  const hash = sha256(bytes);
  const base = hash.slice(0, 16);
  const davPath = `${SOURCE_DIR}/${base}.dav`;
  const sidecarPath = `${SOURCE_DIR}/${base}.json`;
  const emailDateValue = message.getDate();
  const emailDate = emailDateValue.toISOString();
  const revision = revisionFromName(name, emailDateValue);

  const sidecarBytes = Utilities.newBlob(
    JSON.stringify(
      {
        originalName: name,
        messageDate: emailDate,
        subject: message.getSubject(),
        sha256: hash,
        bytes: bytes.length,
      },
      null,
      2,
    ),
  ).getBytes();

  const davInfo = fileInfoInGitHub(owner, repo, branch, davPath, token);
  const sidecarInfo = fileInfoInGitHub(owner, repo, branch, sidecarPath, token);
  if (davInfo === undefined || sidecarInfo === undefined)
    return { ok: false, committed: 0, permanent: false };

  let committed = 0;

  if (!sidecarInfo) {
    const commitMessage =
      `Add timetable sidecar: ${name}\n\n` +
      `Revision: ${revision.code} (${revision.date})\n` +
      `Email date: ${emailDate}\n` +
      `SHA-256: ${hash}`;
    const result = commitToGitHub(owner, repo, branch, sidecarPath, sidecarBytes, commitMessage, token);
    if (!result.ok) return { ok: false, committed, permanent: false };
    committed += 1;
  }

  if (!davInfo) {
    const commitMessage =
      `Add timetable source: ${name}\n\n` +
      `Revision: ${revision.code} (${revision.date})\n` +
      `Email date: ${emailDate}\n` +
      `SHA-256: ${hash}`;
    const result = commitToGitHub(owner, repo, branch, davPath, bytes, commitMessage, token);
    if (!result.ok) return { ok: false, committed, permanent: false };
    committed += 1;
  }

  if (davInfo && sidecarInfo) Logger.log(`Already synced ${davPath}.`);
  return { ok: true, committed, permanent: false };
}

function sha256(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map((value) => ((value & 0xff) + 0x100).toString(16).slice(1))
    .join('');
}

function revisionFromName(name, date) {
  const match = /_R([A-Z0-9]+)_(\d{8})\.dav$/i.exec(name);
  if (match) {
    const code = `R${match[1].toUpperCase()}`;
    const raw = match[2];
    const iso = `${raw.slice(4, 8)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`;
    if (validIsoDate(iso)) return { code, date: iso };
  }
  return {
    code: 'AUTO',
    date: Utilities.formatDate(date, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd'),
  };
}

function validIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function fileInfoInGitHub(owner, repo, branch, path, token) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}` +
    `?ref=${encodeURIComponent(branch)}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: githubHeaders(token),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code === 200) {
    try {
      return JSON.parse(response.getContentText());
    } catch {
      Logger.log(`Invalid GitHub response for ${path}.`);
      return undefined;
    }
  }
  if (code === 404) return null;
  Logger.log(`GitHub lookup failed for ${path} (${code}): ${response.getContentText()}`);
  return undefined;
}

function commitToGitHub(owner, repo, branch, path, bytes, commitMessage, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: githubHeaders(token),
    contentType: 'application/json',
    payload: JSON.stringify({
      message: commitMessage,
      content: Utilities.base64Encode(bytes),
      branch,
    }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();

  if (code === 201) {
    Logger.log(`Committed ${path}`);
    return { ok: true, status: code };
  }

  if (code === 409 || code === 422) {
    const existing = fileInfoInGitHub(owner, repo, branch, path, token);
    if (existing && existingMatches(existing, bytes, path.toLowerCase().endsWith('.json'))) {
      Logger.log(`Confirmed existing ${path} after HTTP ${code}.`);
      return { ok: true, status: code };
    }
  }

  Logger.log(`Failed to commit ${path} (${code}): ${response.getContentText()}`);
  return { ok: false, status: code };
}

function existingMatches(file, bytes, verifyContent) {
  if (file.size !== bytes.length) return false;
  if (!verifyContent) return true;
  if (file.encoding !== 'base64' || typeof file.content !== 'string') return false;
  const existing = Utilities.base64Decode(file.content.replace(/\s+/g, ''));
  if (existing.length !== bytes.length) return false;
  return existing.every((value, index) => (value & 0xff) === (bytes[index] & 0xff));
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gmi-timetable-sync',
  };
}

function encodePath(path) {
  return path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

function installTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'syncDavAttachmentToGithub')
      ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('syncDavAttachmentToGithub').timeBased().everyMinutes(15).create();
}
