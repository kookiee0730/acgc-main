import fs from "fs";
import path from "path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createCloudinaryUploadSignature as signCloudinaryUpload, uploadImageBuffer, uploadMediaBuffer } from "../config/cloudinary.js";

const uploadsDir = path.join(process.cwd(), "uploads");
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime && !fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname) || ".png";
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.fieldname}${extension}`;
    cb(null, safeName);
  },
});

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  }
};

export const uploadMiddleware = multer({
  storage: isVercelRuntime ? multer.memoryStorage() : diskStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const productImageUploadParser = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return cb(null, true);
    }
    const error = new Error("Product photos must be JPEG, PNG, WEBP, or GIF images.");
    error.status = 400;
    return cb(error);
  },
  limits: { fileSize: 4 * 1024 * 1024, files: 5 },
}).fields([
  { name: "main", maxCount: 1 },
  { name: "left", maxCount: 1 },
  { name: "right", maxCount: 1 },
  { name: "top", maxCount: 1 },
  { name: "bottom", maxCount: 1 },
  { name: "files", maxCount: 5 },
]);

export const productImageUploadMiddleware = (req, res, next) => {
  productImageUploadParser(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Product photos must be 4 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
        ? "Upload no more than 5 product photos at a time."
        : "Unable to process product photos.";
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message });
    }
    return res.status(error.status || 400).json({ success: false, message: error.message });
  });
};

const reviewPhotoUploadParser = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return cb(null, true);
    }
    const error = new Error("Review photos must be JPEG, PNG, WEBP, or GIF images.");
    error.status = 400;
    return cb(error);
  },
  limits: { fileSize: 4 * 1024 * 1024, files: 5 },
}).array("files", 5);

export const reviewPhotoUploadMiddleware = (req, res, next) => {
  reviewPhotoUploadParser(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Review photos must be 4 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
        ? "Upload no more than 5 review photos at a time."
        : "Unable to process review photos.";
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message });
    }
    return res.status(error.status || 400).json({ success: false, message: error.message });
  });
};

const paymentProofUploadParser = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(file.mimetype)) {
      return callback(null, true);
    }
    const error = new Error("Payment proof must be a JPEG, PNG, WEBP, GIF, or PDF file.");
    error.status = 400;
    return callback(error);
  },
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
}).single("file");

export const paymentProofUploadMiddleware = (req, res, next) => {
  paymentProofUploadParser(req, res, (error) => {
    if (!error) return next();
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 400;
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Payment proof must be 4 MB or smaller."
      : error.message || "Unable to process payment proof.";
    return res.status(status).json({ success: false, message });
  });
};

const progressMediaUploadParser = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      return callback(null, true);
    }
    const error = new Error("Progress proof must be a PDF, JPEG, PNG, WEBP, or GIF file.");
    error.status = 400;
    return callback(error);
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
}).array("files", 10);

export const progressMediaUploadMiddleware = (req, res, next) => {
  progressMediaUploadParser(req, res, (error) => {
    if (!error) return next();
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 400;
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Progress proof files must be 50 MB or smaller."
      : error.code === "LIMIT_FILE_COUNT"
      ? "Upload no more than 10 progress proof files at a time."
      : error.message || "Unable to process progress proof files.";
    return res.status(status).json({ success: false, message });
  });
};

const cleanupFiles = async (files = []) => {
  await Promise.all(
    files.map(async (file) => {
      if (!file || !file.path) return;
      try {
        await fs.promises.unlink(file.path);
      } catch (err) {
        console.warn("Failed to cleanup upload file:", file.path, err.message);
      }
    })
  );
};

const getSafeUploadExtension = (file) => {
  const originalExtension = path.extname(file.originalname || "").toLowerCase();
  if (originalExtension) return originalExtension;
  if (file.mimetype === "application/pdf") return ".pdf";
  if (file.mimetype === "image/jpeg") return ".jpg";
  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/webp") return ".webp";
  if (file.mimetype === "image/gif") return ".gif";
  return "";
};

const saveBufferedUploadLocally = async (req, file, fieldname = "file") => {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  const extension = getSafeUploadExtension(file);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fieldname}${extension}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filepath, file.buffer);
  return {
    key: fieldname,
    url: `${req.protocol}://${req.get("host")}/uploads/${filename}`,
    filename,
    originalName: file.originalname,
    public_id: filename,
    resource_type: file.mimetype === "application/pdf" ? "raw" : "image",
    format: extension.replace(/^\./, ""),
    storage: "local",
  };
};

const canUseLocalUploadFallback = () => process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";

const getRedactedCloudinaryMessage = (error) =>
  String(error.message || "Cloudinary upload failed")
    .replace(process.env.CLOUDINARY_API_KEY || "\u0000", "[redacted]")
    .replace(process.env.CLOUDINARY_API_SECRET || "\u0000", "[redacted]");

export const uploadImages = async (req, res) => {
  try {
    const { files } = req;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const saved = files.map((file) => ({
      key: file.fieldname,
      url: `${req.protocol}://${req.get("host")}/uploads/${file.filename}`,
    }));

    res.json({ success: true, files: saved });
  } catch (error) {
    console.error("Upload images error:", error);
    await cleanupFiles(req.files);
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "File size exceeds 50MB limit"
          : "Invalid file type: only PDF, JPEG, PNG, WEBP, and GIF are allowed";
      return res.status(400).json({ success: false, message });
    }
    res.status(500).json({ success: false, message: "Unable to upload images", error: error.message });
  }
};

export const uploadProductImages = async (req, res) => {
  const files = Object.entries(req.files || {}).flatMap(([key, fieldFiles]) =>
    fieldFiles.map((file) => ({ key: key === "files" ? file.fieldname : key, file }))
  );

  if (files.length === 0) {
    return res.status(400).json({ success: false, message: "No product photos uploaded." });
  }
  if (files.reduce((size, { file }) => size + file.size, 0) > 4 * 1024 * 1024) {
    return res.status(413).json({ success: false, message: "Product photos must total 4 MB or less per upload." });
  }

  try {
    const saved = await Promise.all(files.map(async ({ key, file }) => {
      const result = await uploadImageBuffer(file.buffer, { folder: "acgc/products" });
      return {
        key,
        url: result.secure_url,
        filename: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
      };
    }));

    return res.status(201).json({ success: true, files: saved });
  } catch (error) {
    const upstreamStatus = Number(error.http_code || error.status) || null;
    const upstreamMessage = (error.message || "Cloudinary upload failed")
      .replace(process.env.CLOUDINARY_API_KEY || "\u0000", "[redacted]")
      .replace(process.env.CLOUDINARY_API_SECRET || "\u0000", "[redacted]");
    console.error("Product image Cloudinary upload failed:", {
      status: upstreamStatus,
      message: upstreamMessage,
    });

    if (canUseLocalUploadFallback()) {
      try {
        const saved = await Promise.all(
          files.map(async ({ key, file }) => saveBufferedUploadLocally(req, file, key))
        );
        console.warn("Product images saved locally because Cloudinary upload failed.");
        return res.status(201).json({ success: true, files: saved, fallback: "local" });
      } catch (fallbackError) {
        console.error("Product image local upload fallback failed:", fallbackError);
      }
    }

    const isDisabledApiKey = upstreamStatus === 401 && /disabled api[_ ]key/i.test(upstreamMessage);
    const isCloudNameMismatch = upstreamStatus === 401 && /cloud_name mismatch/i.test(upstreamMessage);
    const message = error.status === 503
      ? error.message
      : isDisabledApiKey
      ? "Cloudinary says the configured API key is disabled. Create or copy an active API key from the same Cloudinary account, update the backend environment variables, then redeploy."
      : isCloudNameMismatch
      ? "Cloudinary cloud name does not match the configured API key and secret. Use the cloud name and credentials from the same Cloudinary account, then redeploy."
      : upstreamStatus === 401
      ? "Cloudinary rejected the API credentials. Verify that CLOUDINARY_URL or the split Cloudinary variables contain the matching active credentials from the same Cloudinary account, then redeploy the backend."
      : upstreamStatus === 400
      ? "Cloudinary rejected the image data. Try a valid JPEG, PNG, WEBP, or GIF under 4 MB."
      : "Cloudinary upload failed. Check the backend function logs for the upstream error.";

    return res.status(error.status || 502).json({
      success: false,
      message,
      ...(upstreamStatus ? { upstreamStatus } : {}),
    });
  }
};

export const uploadReviewPhotos = async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    return res.status(400).json({ success: false, message: "No review photos uploaded." });
  }
  if (files.reduce((size, file) => size + file.size, 0) > 4 * 1024 * 1024) {
    return res.status(413).json({ success: false, message: "Review photos must total 4 MB or less per upload." });
  }

  try {
    const saved = await Promise.all(files.map(async (file) => {
      const result = await uploadImageBuffer(file.buffer, { folder: "acgc/review-photos" });
      return {
        key: "files",
        url: result.secure_url,
        filename: result.public_id,
        originalName: file.originalname,
        public_id: result.public_id,
        resource_type: result.resource_type,
        format: result.format,
      };
    }));

    return res.status(201).json({ success: true, files: saved });
  } catch (error) {
    const upstreamStatus = Number(error.http_code || error.status) || null;
    const upstreamMessage = getRedactedCloudinaryMessage(error);
    console.error("Review photo Cloudinary upload failed:", {
      status: upstreamStatus,
      message: upstreamMessage,
    });

    if (canUseLocalUploadFallback()) {
      try {
        const saved = await Promise.all(
          files.map(async (file) => saveBufferedUploadLocally(req, file, "files"))
        );
        console.warn("Review photos saved locally because Cloudinary upload failed.");
        return res.status(201).json({ success: true, files: saved, fallback: "local" });
      } catch (fallbackError) {
        console.error("Review photo local upload fallback failed:", fallbackError);
      }
    }

    const isDisabledApiKey = upstreamStatus === 401 && /disabled api[_ ]key/i.test(upstreamMessage);
    const isInvalidCloudName = upstreamStatus === 401 && /invalid cloud_name/i.test(upstreamMessage);
    const isCloudNameMismatch = upstreamStatus === 401 && /cloud_name mismatch/i.test(upstreamMessage);
    const message = error.status === 503
      ? error.message
      : isDisabledApiKey
      ? "Cloudinary rejected the configured API key. Update the backend with an active key and redeploy."
      : isInvalidCloudName
      ? "Cloudinary cloud name is invalid. Update CLOUDINARY_CLOUD_NAME in the backend environment variables, then redeploy."
      : isCloudNameMismatch
      ? "Cloudinary cloud name does not match the configured API key and secret. Update all Cloudinary variables from the same account, then redeploy."
      : upstreamStatus === 401
      ? "Cloudinary rejected the configured credentials. Verify the active key and matching API secret."
      : upstreamStatus === 400
      ? "Cloudinary rejected the review photo data. Try a valid JPEG, PNG, WEBP, or GIF under 4 MB."
      : "Review photo upload failed. Check the backend Cloudinary configuration.";
    const status = error.status || (upstreamStatus === 401 ? 503 : 502);
    return res.status(status).json({ success: false, message });
  }
};

export const uploadPaymentProof = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Select a payment proof file to upload." });
  }

  try {
    const result = req.file.mimetype === "application/pdf"
      ? await uploadMediaBuffer(req.file.buffer, { folder: "acgc/payment-proofs" })
      : await uploadImageBuffer(req.file.buffer, { folder: "acgc/payment-proofs" });
    return res.status(201).json({
      success: true,
      files: [{
        key: "file",
        url: result.secure_url,
        filename: result.public_id,
        originalName: req.file.originalname,
        public_id: result.public_id,
        resource_type: result.resource_type,
        format: result.format,
      }],
    });
  } catch (error) {
    const upstreamStatus = Number(error.http_code || error.status) || null;
    const upstreamMessage = getRedactedCloudinaryMessage(error);
    console.error("Payment proof Cloudinary upload failed:", {
      status: upstreamStatus,
      message: upstreamMessage,
    });

    if (canUseLocalUploadFallback()) {
      try {
        const localFile = await saveBufferedUploadLocally(req, req.file, "file");
        console.warn("Payment proof saved locally because Cloudinary upload failed.");
        return res.status(201).json({ success: true, files: [localFile], fallback: "local" });
      } catch (fallbackError) {
        console.error("Payment proof local upload fallback failed:", fallbackError);
      }
    }

    const isDisabledApiKey = upstreamStatus === 401 && /disabled api[_ ]key/i.test(upstreamMessage);
    const isCloudNameMismatch = upstreamStatus === 401 && /cloud_name mismatch/i.test(upstreamMessage);
    const message = error.status === 503
      ? error.message
      : isDisabledApiKey
      ? "Cloudinary rejected the configured API key. Update the backend with an active key and redeploy."
      : isCloudNameMismatch
      ? "Cloudinary cloud name does not match the configured API key and secret. Update CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET from the same Cloudinary account, then redeploy."
      : upstreamStatus === 401
      ? "Cloudinary rejected the configured credentials. Verify the active key and matching API secret."
      : "Payment proof upload failed. Check the backend Cloudinary configuration.";
    const status = error.status || (upstreamStatus === 401 ? 503 : 502);
    return res.status(status).json({ success: false, message });
  }
};

export const uploadProgressMedia = async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    return res.status(400).json({ success: false, message: "Select at least one progress proof file to upload." });
  }

  try {
    const saved = await Promise.all(files.map(async (file) => {
      const result = await uploadMediaBuffer(file.buffer, { folder: "acgc/progress-media" });
      return {
        key: "files",
        url: result.secure_url,
        filename: result.public_id,
        originalName: file.originalname,
        public_id: result.public_id,
        resource_type: result.resource_type,
        format: result.format,
        pathname: result.public_id,
      };
    }));

    return res.status(201).json({ success: true, files: saved });
  } catch (error) {
    const upstreamStatus = Number(error.http_code || error.status) || null;
    const upstreamMessage = getRedactedCloudinaryMessage(error);
    console.error("Progress media Cloudinary upload failed:", {
      status: upstreamStatus,
      message: upstreamMessage,
    });

    if (canUseLocalUploadFallback()) {
      try {
        const saved = await Promise.all(
          files.map(async (file) => saveBufferedUploadLocally(req, file, "files"))
        );
        console.warn("Progress media saved locally because Cloudinary upload failed.");
        return res.status(201).json({ success: true, files: saved, fallback: "local" });
      } catch (fallbackError) {
        console.error("Progress media local upload fallback failed:", fallbackError);
      }
    }

    const isDisabledApiKey = upstreamStatus === 401 && /disabled api[_ ]key/i.test(upstreamMessage);
    const isInvalidCloudName = upstreamStatus === 401 && /invalid cloud_name/i.test(upstreamMessage);
    const isCloudNameMismatch = upstreamStatus === 401 && /cloud_name mismatch/i.test(upstreamMessage);
    const message = error.status === 503
      ? error.message
      : isDisabledApiKey
      ? "Cloudinary rejected the configured API key. Update the backend with an active key and redeploy."
      : isInvalidCloudName
      ? "Cloudinary cloud name is invalid. Update CLOUDINARY_CLOUD_NAME in the backend environment variables, then redeploy."
      : isCloudNameMismatch
      ? "Cloudinary cloud name does not match the configured API key and secret. Update all Cloudinary variables from the same account, then redeploy."
      : upstreamStatus === 401
      ? "Cloudinary rejected the configured credentials. Verify the active key and matching API secret."
      : "Progress proof upload failed. Check the backend Cloudinary configuration.";
    const status = error.status || (upstreamStatus === 401 ? 503 : 502);
    return res.status(status).json({ success: false, message });
  }
};

const SIGNED_UPLOAD_PURPOSES = {
  uploads: { roles: ["customer", "admin", "super_admin", "skilled_worker"], resourceType: "auto" },
  "review-photos": { roles: ["customer", "admin", "super_admin"], resourceType: "image" },
  "payment-proofs": { roles: ["customer", "admin", "super_admin"], resourceType: "image" },
  "progress-media": { roles: ["admin", "super_admin", "skilled_worker"], resourceType: "auto" },
  "repair-evidence": { roles: ["admin", "super_admin"], resourceType: "image" },
  "repair-media": { roles: ["customer"], resourceType: "auto" },
  contracts: { roles: ["admin", "super_admin", "skilled_worker"], resourceType: "auto" },
  "backup-import": { roles: ["admin", "super_admin"], resourceType: "raw", type: "authenticated" },
};

export const createCloudinaryUploadSignature = (req, res) => {
  const purpose = req.body?.purpose;
  const uploadConfig = SIGNED_UPLOAD_PURPOSES[purpose];
  if (!uploadConfig) {
    return res.status(400).json({ success: false, message: "Upload purpose is not supported." });
  }
  if (!uploadConfig.roles.includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: "You are not authorized to upload this file type." });
  }

  try {
    const extension = path.extname(String(req.body?.filename || "")).toLowerCase();
    if (purpose === "backup-import" && ![".zip", ".gz", ".enc"].includes(extension)) {
      return res.status(400).json({ success: false, message: "Upload an encrypted .zip backup, or a legacy .json.gz backup file." });
    }
    const signature = signCloudinaryUpload({
      folder: `acgc/${purpose}`,
      publicId: `${randomUUID()}${purpose === "backup-import" ? extension : ""}`,
      resourceType: uploadConfig.resourceType,
      type: uploadConfig.type || "upload",
    });
    return res.json({ success: true, ...signature });
  } catch (error) {
    return res.status(error.status || 503).json({ success: false, message: error.message || "Cloudinary is not configured." });
  }
};

export default {
  uploadImages,
  uploadProductImages,
  uploadReviewPhotos,
  uploadPaymentProof,
  uploadProgressMedia,
  createCloudinaryUploadSignature,
  uploadMiddleware,
  reviewPhotoUploadMiddleware,
};
