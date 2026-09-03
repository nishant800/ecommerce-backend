import Address from "./address.model.js";

export class AddressService {
    // Add Address
    static async create(userId: string, data: any) {
        if (data.isDefault) {
            await Address.updateMany(
                { user: userId },
                { isDefault: false }
            );
        }

        return await Address.create({
            ...data,
            user: userId,
        });
    }

    // Get All Addresses
    static async getAll(userId: string) {
        return await Address.find({ user: userId }).sort({
            isDefault: -1,
            createdAt: -1,
        });
    }

    // Update Address
    static async update(
        userId: string,
        addressId: string,
        data: any
    ) {
        if (data.isDefault) {
            await Address.updateMany(
                { user: userId },
                { isDefault: false }
            );
        }

        return await Address.findOneAndUpdate(
            {
                _id: addressId,
                user: userId,
            },
            data,
            {
                new: true,
                runValidators: true,
            }
        );
    }

    // Delete Address
    static async delete(
        userId: string,
        addressId: string
    ) {
        const address =
            await Address.findOneAndDelete({
                _id: addressId,
                user: userId,
            });

        if (
            address &&
            address.isDefault
        ) {
            const nextAddress =
                await Address.findOne({
                    user: userId,
                }).sort({
                    createdAt: -1,
                });

            if (nextAddress) {
                nextAddress.isDefault = true;

                await nextAddress.save();
            }
        }

        return address;
    }

    // Set Default Address
    static async setDefault(
        userId: string,
        addressId: string
    ) {
        await Address.updateMany(
            { user: userId },
            { isDefault: false }
        );

        return await Address.findOneAndUpdate(
            {
                _id: addressId,
                user: userId,
            },
            {
                isDefault: true,
            },
            {
                new: true,
            }
        );
    }
}