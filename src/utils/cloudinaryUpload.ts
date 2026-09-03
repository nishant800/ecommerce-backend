import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (buffer: Buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "ecommerce/products",
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        streamifier.createReadStream(buffer).pipe(stream);
    });
};