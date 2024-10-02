"use client";

import { auth, firestoreDb } from "@/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
    collection,
    doc,
    onSnapshot,
    setDoc,
    Unsubscribe,
} from "firebase/firestore";
import { setMany, values } from "idb-keyval";
import { isEqual, xorWith } from "lodash";
import md5 from "md5";
import { createContext, useContext, useEffect, useState } from "react";
import { useRefreshControl } from "./RefreshControlContext";
import { IScheduleSchemaType } from "@/lib/utils";

type AuthContextType = {
    user: User | null;
};

const Context = createContext({} as AuthContextType);

export function useAuthContext() {
    return useContext(Context);
}

export default function AuthContext({
    children,
}: {
    children: React.ReactNode;
}) {
    const { setRefreshControl } = useRefreshControl();
    const [user, setUser] = useState<User | null>(null);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async u => {
            setUser(u);
        });

        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            console.log("cleanup done - state");
        };
    }, []);

    useEffect(() => {
        let unsubscribe: Unsubscribe | undefined;
        if (user) {
            console.log("user signed in");
            const q = collection(firestoreDb, "users", user.uid, "schedules");

            unsubscribe = onSnapshot(q, async snapshot => {
                let all_data_from_server: ISchedule[] = [];
                snapshot.forEach(async doc => {
                    try {
                        const data = IScheduleSchemaType.parse(
                            doc.data() as ISchedule
                        );
                        all_data_from_server.push(data);
                    } catch (error) {
                        console.log("error parsing data from server: ", error);
                    }
                });

                console.log(all_data_from_server.length);

                const all_data_from_idb = await values();
                const intersection: ISchedule[] = xorWith(
                    all_data_from_idb,
                    all_data_from_server,
                    isEqual
                );

                await setMany(
                    intersection.map(data => {
                        return [data.time, data];
                    })
                );

                intersection.forEach(async data => {
                    try {
                        await setDoc(
                            doc(
                                firestoreDb,
                                "users",
                                user.uid,
                                `schedules`,
                                md5(data.time.toString())
                            ),
                            data,
                            { merge: true }
                        );
                    } catch (error) {
                        console.warn(error);
                    }
                });
                setRefreshControl(prev => prev + 1);
            });
        } else {
            if (typeof unsubscribe === "function") unsubscribe();
        }
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            console.log("cleanup done - docs");
        };
    }, [user]);

    return <Context.Provider value={{ user }}>{children}</Context.Provider>;
}
