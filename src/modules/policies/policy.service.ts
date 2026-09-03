import {
    PolicyType,
} from "./policy.model.js";

import {
    STATIC_POLICIES,
} from "./policy.constants.js";


// =========================================
// POLICY SERVICE
// =========================================

export class PolicyService {


    // =========================================
    // GET POLICY
    // =========================================

    static async getActivePolicy(
        type: PolicyType,
    ) {

        const policy =
            STATIC_POLICIES[type];

        if (
            !policy ||
            !policy.active
        ) {
            return null;
        }

        return policy;
    }


    // =========================================
    // GET ALL POLICIES
    // =========================================

    static async getAllActivePolicies() {

        return Object.values(
            STATIC_POLICIES,
        ).filter(
            policy =>
                policy.active,
        );
    }


    // =========================================
    // CREATE POLICY
    //
    // Kept for compatibility.
    // Customer-facing policies are no longer
    // read from MongoDB.
    // =========================================

    static async create(
        data: {
            type: PolicyType;
            title: string;
            content: string;
            version?: string;
        },
    ) {

        return {
            ...data,
            version:
                data.version ||
                "1.0",
            active: true,
        };
    }


    // =========================================
    // UPDATE POLICY
    //
    // Customer-facing policy content is controlled
    // by policy.constants.ts.
    // =========================================

    static async update(
        type: PolicyType,
        data: {
            title?: string;
            content?: string;
            version?: string;
            active?: boolean;
        },
    ) {

        throw new Error(
            `Static policy "${type}" is managed in policy.constants.ts.`,
        );
    }
}