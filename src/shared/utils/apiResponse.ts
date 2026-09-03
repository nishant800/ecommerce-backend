export class ApiResponse<T> {
    constructor(
        public success: boolean,
        public message: string,
        public data?: T
    ) { }

    static success<T>(message: string, data?: T) {
        return new ApiResponse(true, message, data);
    }

    static error(message: string) {
        return new ApiResponse(false, message);
    }
}