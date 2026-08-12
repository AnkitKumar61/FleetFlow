export function ok(res, data, meta, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

