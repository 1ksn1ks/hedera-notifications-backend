// Display-only reading of Meritocracy topic messages.
// The stored body stays the raw consensus message. Other apps, and
// Meritocracy settings, are left untouched. Keep this in step with
// hedera-notifications-frontend meritocracyFormat.ts.

function firstHttpUrl(value) {
  const raw = Array.isArray(value) ? value.find((item) => typeof item === 'string' && item.trim()) : value;
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
}

function textOf(value) {
  return typeof value === 'string' ? value : '';
}

// One [lng, lat] is a marker. Two or more points are a polygon.
function pointCount(value) {
  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      !Array.isArray(value[0]) &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      return 1;
    }
    let count = 0;
    for (const item of value) count += pointCount(item);
    return count;
  }
  if (typeof value === 'string' && value.trim()) {
    const nums = value.match(/-?\d+(?:\.\d+)?/g);
    return nums ? Math.floor(nums.length / 2) : 0;
  }
  return 0;
}

function pairText(value) {
  if (Array.isArray(value) && value.length >= 2 && !Array.isArray(value[0])) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return `${lng},${lat}`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

function cordText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (pointCount(value) === 1) return pairText(value);
  if (!Array.isArray(value)) return '';
  return value.map(cordText).filter(Boolean).join(', ');
}

// The field with the most points decides. One point is a marker.
function shareShape(share) {
  let best = null;
  let bestCount = 0;
  for (const field of [share.coords, share.cord, share.pin]) {
    const count = pointCount(field);
    if (count > bestCount) {
      bestCount = count;
      best = field;
    }
  }
  const kind = bestCount >= 2 ? 'polygon' : bestCount === 1 ? 'marker' : share.kind === 'polygon' ? 'polygon' : 'marker';
  return { kind, cord: best ? cordText(best) : '' };
}

// Returns null when the message is not a Meritocracy post a person should read
// (settings, rules, profile fields, or some other app's format).
export function classifyMeritocracy(raw) {
  if (typeof raw !== 'string') return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  if (typeof parsed.userMessage === 'string') {
    return { kind: 'chat', text: parsed.userMessage };
  }

  if (
    parsed.encryptedMessage &&
    typeof parsed.encryptedMessage === 'object' &&
    typeof parsed.encryptedMessage.ciphertext === 'string'
  ) {
    return { kind: 'encrypted-chat' };
  }

  const keys = Object.keys(parsed);
  if (keys.length === 1 && keys[0] === 'ciphertext' && typeof parsed.ciphertext === 'string') {
    return { kind: 'encrypted' };
  }

  const marker = parsed.marker && parsed.marker.data;
  if (marker && typeof marker === 'object') {
    const removing =
      marker.deleteMarkerNumber != null &&
      marker.title == null &&
      marker.msg == null &&
      marker.cord == null;
    if (removing) {
      return { kind: 'marker-delete', number: String(marker.deleteMarkerNumber) };
    }
    return {
      kind: 'marker',
      title: textOf(marker.title).slice(0, 20),
      text: textOf(marker.msg),
      cord: textOf(marker.cord),
      image: firstHttpUrl(marker.image) || firstHttpUrl(marker.coverimage),
      number: marker.numberOfMarker != null ? String(marker.numberOfMarker) : '',
    };
  }

  const polygon = parsed.polygon && parsed.polygon.data;
  if (polygon && typeof polygon === 'object') {
    const removing =
      polygon.deletePolygonNumber != null &&
      polygon.title == null &&
      polygon.msg == null &&
      polygon.cord == null;
    if (removing) {
      return { kind: 'polygon-delete', number: String(polygon.deletePolygonNumber) };
    }
    return {
      kind: 'polygon',
      title: textOf(polygon.title).slice(0, 20),
      text: textOf(polygon.msg),
      cord: textOf(polygon.cord),
      image: firstHttpUrl(polygon.image) || firstHttpUrl(polygon.coverimage),
      number: polygon.numberOfPolygon != null ? String(polygon.numberOfPolygon) : '',
    };
  }

  // Someone shared another person's post. One coordinate pair is a marker.
  // Two or more are a polygon. Title, text, and image are filled only when
  // the message itself carries them.
  const share = parsed.share;
  if (share && typeof share === 'object' && !Array.isArray(share)) {
    const shape = shareShape(share);
    const kind = shape.kind;
    const topic = textOf(share.topic).trim();
    const author = textOf(share.payer).trim();
    const cord = shape.cord;
    const number = share.number != null && String(share.number) !== '' ? String(share.number) : '';
    const topicOk = /^\d+\.\d+\.\d+$/.test(topic);
    const authorOk = /^\d+\.\d+\.\d+$/.test(author);
    if (topicOk || cord || number) {
      return {
        kind,
        title: textOf(share.title).slice(0, 20),
        text: textOf(share.msg),
        cord,
        image: firstHttpUrl(share.image) || firstHttpUrl(share.coverimage) || firstHttpUrl(share.cover),
        number,
        shared: true,
        placeTopic: topicOk ? topic : '',
        placePayer: authorOk ? author : '',
      };
    }
  }

  return null;
}

// https://onlyonhbar.com/0.0.1?place=marker&topic=0.0.1&payer=0.0.2&n=4&at=lng,lat
// The topic is the path because Meritocracy loads a topic from the pathname.
export function placeUrl({ kind, topicId, payer, number, cord }) {
  const topic = topicId ? String(topicId).trim() : "";
  const url = new URL(topic ? `https://onlyonhbar.com/${encodeURIComponent(topic)}` : "https://onlyonhbar.com/");
  url.searchParams.set("place", kind === "polygon" ? "polygon" : "marker");
  if (topic) url.searchParams.set("topic", topic);
  if (payer) url.searchParams.set("payer", String(payer));
  if (number != null && String(number) !== "") url.searchParams.set("n", String(number));
  const at = placePoint(kind, cord);
  if (at) url.searchParams.set("at", at);
  return url.toString();
}

function placePoint(kind, cord) {
  if (typeof cord !== "string" || !cord.trim()) return "";
  if (kind !== "polygon") {
    const parts = cord.split(",").map((part) => part.trim());
    if (parts.length < 2) return "";
    if (parts.slice(0, 2).some((part) => part === "" || Number.isNaN(Number(part)))) return "";
    return `${parts[0]},${parts[1]}`;
  }
  const nums = [...cord.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  // A shared polygon stores one pin, not the ring. That point still opens the map.
  if (nums.length === 2 && nums.every((num) => Number.isFinite(num))) return `${nums[0]},${nums[1]}`;
  if (nums.length < 4) return "";
  let lng = 0;
  let lat = 0;
  let count = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    lng += nums[i];
    lat += nums[i + 1];
    count += 1;
  }
  if (!count) return "";
  return `${(lng / count).toFixed(5)},${(lat / count).toFixed(5)}`;
}

export function clipText(text, max = 100) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 3)) + '...';
}

// One line for the phone banner. The in-app list formats the same shapes.
export function previewMeritocracy(raw) {
  const view = classifyMeritocracy(raw);
  if (!view) return typeof raw === 'string' ? raw : String(raw ?? '');

  if (view.kind === 'chat') return view.text.trim() ? view.text : '(empty message)';
  if (view.kind === 'encrypted-chat') return 'Encrypted chat';
  if (view.kind === 'encrypted') return 'Encrypted message';
  if (view.kind === 'marker-delete') return 'Marker removed';
  if (view.kind === 'polygon-delete') return 'Polygon removed';

  const msg = view.text.trim() ? `: ${view.text.trim()}` : '';
  if (view.shared) {
    const title = view.title.trim();
    const label = view.kind === 'polygon' ? 'Shared polygon' : 'Shared marker';
    return title ? `${label} · ${title}${msg}` : `${label}${msg}`.trim();
  }
  const label = view.kind === 'marker' ? 'Marker' : 'Polygon';
  const title = view.title.trim() || label;
  return `${label} · ${title}${msg}`;
}
