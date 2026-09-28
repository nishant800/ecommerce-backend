import Address from "./address.model.js";
// =========================================
// ADDRESS INPUT
// =========================================
interface AddressInput {
    fullName?: string;
    phone?: string;
    pincode?: string;
    house?: string;
    street?: string;
    area?: string;
    landmark?: string;
    city?: string;
    state?: string;
    country?: string;
    type?: string;
    latitude?: number;
    longitude?: number;
    isDefault?: boolean;
}
export class AddressService {
    // =========================================
    // BUILD ADDRESS DATA
    // =========================================
    private static buildAddressData(
        data: AddressInput
    ) {
        const {
            latitude,
            longitude,
            ...addressData
        } = data;
        const updateData: any = {
            ...addressData,
        };
        // =====================================
        // GPS LOCATION
        // =====================================
        //
        // Customer app sends:
        //
        // latitude
        // longitude
        //
        // MongoDB stores GeoJSON:
        //
        // [longitude, latitude]
        //
        const hasLatitude =
            latitude !== undefined &&
            latitude !== null;
        const hasLongitude =
            longitude !== undefined &&
            longitude !== null;
        // If one coordinate is supplied,
        // both must be supplied.
        if (
            hasLatitude !== hasLongitude
        ) {
            throw new Error(
                "Both latitude and longitude are required for delivery location"
            );
        }
        if (
            hasLatitude &&
            hasLongitude
        ) {
            const lat =
                Number(latitude);
            const lng =
                Number(longitude);
            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lng)
            ) {
                throw new Error(
                    "Invalid delivery location coordinates"
                );
            }
            if (
                lat < -90 ||
                lat > 90
            ) {
                throw new Error(
                    "Latitude must be between -90 and 90"
                );
            }
            if (
                lng < -180 ||
                lng > 180
            ) {
                throw new Error(
                    "Longitude must be between -180 and 180"
                );
            }
            updateData.location = {
                type: "Point",
                coordinates: [
                    lng,
                    lat,
                ],
            };
        }
        return updateData;
    }
    // =========================================
    // ADD ADDRESS
    // =========================================
    static async create(
        userId: string,
        data: AddressInput
    ) {
        // Check whether customer already
        // has any saved address.
        const existingAddressCount =
            await Address.countDocuments({
                user: userId,
            });
        // First address automatically
        // becomes the default address.
        const shouldBeDefault =
            existingAddressCount === 0 ||
            data.isDefault === true;
        // If this address is going to be
        // default, remove default status
        // from previous addresses.
        if (shouldBeDefault) {
            await Address.updateMany(
                {
                    user: userId,
                },
                {
                    $set: {
                        isDefault: false,
                    },
                }
            );
        }
        const addressData =
            this.buildAddressData(data);
        return await Address.create({
            ...addressData,
            user: userId,
            isDefault:
                shouldBeDefault,
        });
    }
    // =========================================
    // GET ALL ADDRESSES
    // =========================================
    static async getAll(
        userId: string
    ) {
        return await Address.find({
            user: userId,
        }).sort({
            isDefault: -1,
            createdAt: -1,
        });
    }
    // =========================================
    // GET SINGLE ADDRESS
    // =========================================
    static async getById(
        userId: string,
        addressId: string
    ) {
        return await Address.findOne({
            _id: addressId,
            user: userId,
        });
    }
    // =========================================
    // UPDATE ADDRESS
    // =========================================
    static async update(
        userId: string,
        addressId: string,
        data: AddressInput
    ) {
        // Make sure the address belongs
        // to this authenticated user.
        const existingAddress =
            await Address.findOne({
                _id: addressId,
                user: userId,
            });
        if (!existingAddress) {
            return null;
        }
        const addressData =
            this.buildAddressData(data);
        // =====================================
        // DEFAULT ADDRESS
        // =====================================
        if (data.isDefault === true) {
            // Only clear other addresses.
            // Do not clear this address first.
            await Address.updateMany(
                {
                    user: userId,
                    _id: {
                        $ne: addressId,
                    },
                },
                {
                    $set: {
                        isDefault: false,
                    },
                }
            );
            addressData.isDefault = true;
        }
        // Do not allow the normal update
        // endpoint to leave the customer
        // without a default address.
        //
        // To change the default address,
        // another address should be selected.
        if (
            data.isDefault === false &&
            existingAddress.isDefault
        ) {
            delete addressData.isDefault;
        }
        return await Address.findOneAndUpdate(
            {
                _id: addressId,
                user: userId,
            },
            {
                $set: addressData,
            },
            {
                new: true,
                runValidators: true,
            }
        );
    }
    // =========================================
    // DELETE ADDRESS
    // =========================================
    static async delete(
        userId: string,
        addressId: string
    ) {
        const address =
            await Address.findOneAndDelete({
                _id: addressId,
                user: userId,
            });
        if (!address) {
            return null;
        }
        // If deleted address was default,
        // automatically choose another one.
        if (address.isDefault) {
            const nextAddress =
                await Address.findOne({
                    user: userId,
                }).sort({
                    createdAt: -1,
                });
            if (nextAddress) {
                nextAddress.isDefault =
                    true;
                await nextAddress.save();
            }
        }
        return address;
    }
    // =========================================
    // SET DEFAULT ADDRESS
    // =========================================
    static async setDefault(
        userId: string,
        addressId: string
    ) {
        // IMPORTANT:
        //
        // Verify target address BEFORE
        // clearing the current default.
        //
        // Otherwise an invalid address ID
        // could remove the user's existing
        // default address.
        const address =
            await Address.findOne({
                _id: addressId,
                user: userId,
            });
        if (!address) {
            return null;
        }
        // Already default.
        if (address.isDefault) {
            return address;
        }
        // Clear all OTHER defaults.
        await Address.updateMany(
            {
                user: userId,
                _id: {
                    $ne: addressId,
                },
            },
            {
                $set: {
                    isDefault: false,
                },
            }
        );
        address.isDefault = true;
        await address.save();
        return address;
    }
}