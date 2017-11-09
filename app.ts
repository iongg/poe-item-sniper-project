import express = require('express');
import bodyParser = require('body-parser');
import _ = require('lodash');

import axios from 'axios';

import fs = require('fs');
import {copyFileSync} from "fs";

let app = express();
app.use(bodyParser.json());

let port = process.env.PORT || 3000;

const currentLeague: string = 'Harbinger';
const chaosCutOffPoint: number = 20;
let exaltToChaos: number;
let pricedUniques: any[];


// let latestID = '107295783-112515506-105611526-121592033-113798215';

const getLatestID = async () => {
    try {
        let response = await axios.get(`http://api.poe.ninja/api/Data/GetStats`);
        // console.log(response.data.next_change_id);
        return await response.data.next_change_id;
    } catch (e) {
        console.log(e)
    }
};

const getCurrencyToChaosRatio = async (name: string) => {
    try {
        let response = await axios.get(`http://poe.ninja/api/Data/GetCurrencyOverview?league=${currentLeague}`);
        let res: number = 0;
        response.data.lines.forEach((item) => {
            if (item.currencyTypeName === name){
                res = item.chaosEquivalent
            }
        });
        return res;
    } catch (e) {
        console.log(e)
    }
};

const getUniquePrices = async () => {
    try {
        let armourResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueArmourOverview?league=${currentLeague}`);
        let weaponsResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueWeaponOverview?league=${currentLeague}`);
        let flasksResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueFlaskOverview?league=${currentLeague}`);
        let jewelryResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueAccessoryOverview?league=${currentLeague}`);
        let jewelsResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueJewelOverview?league=${currentLeague}`);

        let filteredUniques: any[] = [];

        armourResponse.data.lines.forEach((item) => {
            if(item.chaosValue >= chaosCutOffPoint && item.count >= 10) {
                filteredUniques.push(item)
            }
        });
        weaponsResponse.data.lines.forEach((item) => {
            if(item.chaosValue >= chaosCutOffPoint && item.count >= 10) {
                filteredUniques.push(item)
            }
        });
        flasksResponse.data.lines.forEach((item) => {
            if(item.chaosValue >= chaosCutOffPoint && item.count >= 10) {
                filteredUniques.push(item)
            }
        });
        jewelryResponse.data.lines.forEach((item) => {
            if(item.chaosValue >= chaosCutOffPoint && item.count >= 10) {
                filteredUniques.push(item)
            }
        });
        jewelsResponse.data.lines.forEach((item) => {
            if(item.chaosValue >= chaosCutOffPoint && item.count >= 10) {
                filteredUniques.push(item)
            }
        });

        return filteredUniques
    } catch (e) {
        console.log(e)
    }
};

getUniquePrices().then((filteredUniques) => {
    pricedUniques = filteredUniques;
});

getCurrencyToChaosRatio('Exalted Orb').then((ratio) =>{
    exaltToChaos = ratio;
    // console.log(exaltToChaos);
});

let latestID: string;

getLatestID().then((id) => {
    latestID = id;
});

//Gets stashes from GGG API, then filters them
let filterLoop =  () => {
    setTimeout( async () => {

        try {

            //TODO check if im using compression
            //Start timing
            let startTime = Date.now();
            //Get stashes using next change ID
            let response = await axios.get(`http://api.pathofexile.com/public-stash-tabs/?id=${latestID}`);
            //End timing for get request
            let endTimeGet = (Date.now() - startTime)/1000;
            //Prints out how many stashes we got back, mainly for debugging
            // console.log(`Number of stashes ${response.data.stashes.length}`);

            //Filters out the non public stashes
            let publicStashes = await _.filter(response.data.stashes, (stash) => stash.public);
            //Prints out how many public stashes we got back, mainly for debugging
            // console.log(`Number of public stashes ${publicStashes.length}`);

            //Filters out stashes that have no items, and stashes not in the currently assigned league
            let leagueStashes = await _.filter(publicStashes, (stash) => {
                if (stash.items.length > 0) {
                    return stash.items[0].league === currentLeague;
                } else {
                    return false;
                }
            });

            //Prints out how many public, non empty, stashes from the assigned league we got back, mainly for debugging
            // console.log(`Number of harbinger public stashes ${leagueStashes.length}`);

            let uniques: any[] = [];
            //Filter out the unique items
            publicStashes.forEach((stash) => {

                let j = 0;
                try {

                    stash.items.forEach((item) => {
                        //If the Item IS UNIQUE, ISNT CORRUPTED, IS IDENTIFIED, AND HAS A NOTE
                        if(item.frameType === 3 && !item.corrupted && item.identified && item.note){
                            //Store the actual note in another place, replace note with the chaos value of the item,
                            //trim unique name from the way its presented in the public stash api

                            item.icon = item.note; //Not pretty but storing the actual note is useful for the WTB message
                            item.note = item.note.replace('~b/o','');
                            item.note = item.note.replace('~price','');
                            item.note = item.note.trim();
                            if (item.note.includes('exa')) {
                                item.note = item.note.replace('exa','');
                                item.note = item.note.trim();
                                item.note = Number(item.note)*exaltToChaos;
                            } else if (item.note.includes('chaos')) {
                                item.note = item.note.replace('chaos','');
                                item.note = item.note.trim();
                                item.note = Number(item.note);
                            }

                            item.name = item.name.slice(item.name.lastIndexOf('>') + 1);

                            //Count socket group to determine how many links an item has, should be able to deal with reverse 5l's
                            let links: number = 0;
                            if (item.sockets.length > 0) {
                                item.sockets.forEach((socket) => {
                                    if (socket.group === 0) {
                                        links ++
                                    }
                                });
                            }
                            if (item.sockets.length > 0 && links <= 1) {
                                links = 0;
                                item.sockets.forEach((socket) => {
                                    if (socket.group === 1) {
                                        links ++
                                    }
                                });
                            }
                            if (links < 5) {
                                links = 0
                            }
                            item.sockets = links;

                            //Designate Vinktars properly
                            if(item.name === 'Vessel of Vinktar') {
                                item.explicitMods.forEach((mod) => {
                                    if(mod.includes('Spells')) {
                                        item.explicitMods = "Added Spells";
                                    } else if(mod.includes('Attacks')) {
                                        item.explicitMods = "Added Attacks";
                                    } else if(mod.includes('Penetrates')) {
                                        item.explicitMods = "Penetration";
                                    } else if(mod.includes('Converted')) {
                                        item.explicitMods = "Conversion";
                                    } else {
                                        item.explicitMods = null;
                                    }
                                });
                            }
                            //Push an items that passed the check to an array
                            j++;
                            uniques.push(item);
                        }
                    });
                } catch (e) {
                    console.log(e);
                }

            });

            //TODO sort vinktars
            // uniques.forEach((item) => {
            //     if (item.name === 'Vessel of Vinktar') {
            //         console.log(JSON.stringify(item, null, 2));
            //     }
            // };

            //DEBUG STUFF BELOW HERE

            // uniques.forEach((item) => {
            //     pricedUniques.forEach((pricedItem) => {
            //         if(item.name === pricedItem.name && item.sockets === pricedItem.links) {
            //             console.log(`${item.name} -- Item Price: ${item.note} chaos\nPoe.Ninja Price: ${pricedItem.chaosValue} chaos/ ${pricedItem.exaltedValue} exa\nPrice diference ratio ${pricedItem.chaosValue/item.note}\n`);
            //         }
            //     })
            // });

            // uniques.forEach((item) => {
            //     let previousNotes = fs.readFileSync('notes_list.txt');
            //     fs.writeFileSync('notes_list.txt',`${previousNotes} \n${item.name} -- Note: ${item.note}`);
            // };

            // let i = 0;
            // uniques.forEach((item) => {
            //     console.log(`${item.name} -- Note: ${item.note}`);
            //     if (item.sockets !== 0) {
            //         console.log(`Linked sockets: ${item.sockets} \n`);
            //     } else {
            //         console.log(`None or under 5 linked sockets`)
            //     }
            //     i++;
            // });
            // console.log(`Number of items printed to console ${i}`);

            console.log('////');
            console.log(`Number of items in the uniques array ${uniques.length}`);

            //Assigns a new ID based on what is received in the response
            let nextId = response.data.next_change_id;
            //Stores the latest change ID
            // fs.writeFileSync('latest_change_id.txt',nextId);

            //Check if theres a new stash ID
            if(nextId!==latestID) {
                latestID = nextId;

                console.log(`Next change id: ${nextId}`);
                console.log(`Time it took to execute Get request: ${endTimeGet}s`);
            } else {
                console.log(`Reached end of stash stream`);
                console.log(`Next change id: ${nextId}`);
                console.log(`Time it took to execute Get request: ${endTimeGet}s`);
            }

            //End timing for the rest of the function
            let endTimeGeneral = (Date.now() - startTime)/1000;
            console.log(`Time it took to executethe whole thing: ${endTimeGeneral}s`);
            console.log('////\n');

            filterLoop();

        } catch (e) {

            console.log(e);


        }

    }, 1050);
};

filterLoop();
app.listen(port, () => console.log(`Started on port ${port}`));