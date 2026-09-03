import {
    Request,
    Response,
} from "express";

import {
    uploadToCloudinary,
} from "../utils/cloudinaryUpload.js";


export const uploadImages =
    async (
        req: Request,
        res: Response
    ) => {

        try {

            const files =
                req.files as Express.Multer.File[];


            console.log(
                "UPLOAD FILES:",
                files?.map(
                    file => ({
                        fieldname:
                            file.fieldname,

                        originalname:
                            file.originalname,

                        mimetype:
                            file.mimetype,
                    })
                )
            );


            if (
                !files ||
                files.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "No files uploaded",

                });
            }


            // =====================================
            // IMAGE VALIDATION
            // =====================================

            const invalidFile =
                files.find(
                    file =>
                        !file.mimetype.startsWith(
                            "image/"
                        )
                );


            if (invalidFile) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Only image files are allowed",

                });
            }


            // =====================================
            // CLOUDINARY
            // =====================================

            const images = [];


            for (
                const file of files
            ) {

                const result: any =
                    await uploadToCloudinary(
                        file.buffer
                    );


                images.push({

                    url:
                        result.secure_url,

                    publicId:
                        result.public_id,

                });

            }


            return res.json({

                success: true,

                images,

            });

        } catch (
        error: any
        ) {

            console.error(
                "UPLOAD ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Image upload failed",

            });

        }
    };