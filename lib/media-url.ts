// Is this stored URL a video? Uploads keep the real extension (the upload
// routes refuse an unknown video type rather than guess), so the extension is
// the truth. Shared by the admin editor and the public pages.
export const isVideoUrl = (u: string | null | undefined) => !!u && /\.(mp4|webm|mov)(\?|#|$)/i.test(u)
