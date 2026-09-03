import multer from "multer";

const storage =
    multer.memoryStorage();

const upload =
    multer({
        storage,

        limits: {
            fileSize:
                5 * 1024 * 1024,

            files: 10,
        },

        fileFilter: (
            _req,
            file,
            cb
        ) => {

            console.log(
                "UPLOAD FIELD:",
                file.fieldname
            );

            console.log(
                "UPLOAD NAME:",
                file.originalname
            );

            console.log(
                "UPLOAD MIME:",
                file.mimetype
            );

            cb(null, true);
        },
    });

export default upload;