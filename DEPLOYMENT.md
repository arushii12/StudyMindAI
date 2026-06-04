# Deployment Notes

## PDF uploads

`server/uploads` is temporary local storage for uploaded PDFs. It can work for short-term Render testing, but it is not durable production storage. Files may be lost after deploys, restarts, scaling, or instance replacement.

Move PDF storage to Cloudinary, S3, UploadThing, GridFS, or another durable storage service before relying on uploaded files in production.
