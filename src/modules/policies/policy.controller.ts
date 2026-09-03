import {
    Request,
    Response,
} from "express";

import {
    PolicyService,
} from "./policy.service.js";

import {
    PolicyType,
} from "./policy.model.js";


// =========================================
// VALID POLICY TYPES
// =========================================

const POLICY_TYPES: PolicyType[] = [

    "terms",

    "privacy",

    "replacement",

    "cancellation",

    "shipping",

    "refund",

];


export class PolicyController {


    // =========================================
    // GET POLICY
    // =========================================

    static async getPolicy(
        req: Request,
        res: Response,
    ) {

        try {

            const type =
                String(
                    req.params.type,
                ) as PolicyType;


            if (
                !POLICY_TYPES.includes(
                    type,
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid policy type.",

                });

            }


            const policy =
                await PolicyService.getActivePolicy(
                    type,
                );


            if (!policy) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Policy not found.",

                });

            }


            return res.json({

                success: true,

                data: policy,

            });

        } catch (error: any) {

            console.error(
                "GET POLICY ERROR:",
                error,
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Failed to load policy.",

            });

        }

    }


    // =========================================
    // GET ALL POLICIES
    // =========================================

    static async getAllPolicies(
        _req: Request,
        res: Response,
    ) {

        try {

            const policies =
                await PolicyService
                    .getAllActivePolicies();


            return res.json({

                success: true,

                data: policies,

            });

        } catch (error: any) {

            console.error(
                "GET POLICIES ERROR:",
                error,
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Failed to load policies.",

            });

        }

    }

}