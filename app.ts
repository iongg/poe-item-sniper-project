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




let getLatestID = async () => {
    try {
        let response = await axios.get(`http://api.poe.ninja/api/Data/GetStats`);
        // console.log(response.data.next_change_id);
        return response.data.next_change_id;
    } catch (e) {
        console.log(e)
    }
};

let getCurrencyToChaosRatio = async (name: string) => {
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

//Fetches unique item prices from the poe.ninja API, and filters any that have a value under the chaosCutOffPoint
let getUniquePrices = async () => {
    try {
        //poe.ninja API routes
        let armourResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueArmourOverview?league=${currentLeague}`);
        let weaponsResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueWeaponOverview?league=${currentLeague}`);
        let flasksResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueFlaskOverview?league=${currentLeague}`);
        let jewelryResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueAccessoryOverview?league=${currentLeague}`);
        let jewelsResponse = await axios.get(`http://cdn.poe.ninja/api/Data/GetUniqueJewelOverview?league=${currentLeague}`);

        let filteredUniques: any[] = [];

        //Pushing items that are above the chaosCutOffPoint to the filtered uniques array
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

        filteredUniques.forEach((item) => {
           if(item.explicitModifiers){
               item.explicitModifiers.forEach((mod) => {
                   if (!mod.optional) {
                       let string = mod.text;
                       let place = string.indexOf('(');
                       let position : any[] = [];

                       while (place !== -1) {
                           position.push(place);
                           place = string.indexOf('(', place + 1);
                       }

                       if (position.length) {
                           // console.log(`PLACE ARRAY ${position}\n`);
                           // console.log(`INITIAL STRING ${string}`);
                           let difference = 0;
                           position.forEach((pos1) => {

                               if (difference) {
                                   pos1 = pos1 - difference
                               }
                               let pos2 = string.indexOf('-', pos1);
                               let pos3 = string.indexOf(')', pos2);
                               // console.log(`FIRST POSITION ${pos1} \nSECOND POSITION ${pos2} \nTHIRD POSITION ${pos3}`)

                               let num1 = Number(string.slice(pos1+1,pos2));
                               let num2 = Number(string.slice(pos2+1,pos3));
                               // console.log(`FIRST NUMBER ${num1} \nSECOND NUMBER ${num2}`);

                               let average = (num1+num2)/2;
                               let subString1 = string.slice(0,pos1);
                               let subString2 = string.slice(pos3+1);
                               // console.log(`FIRST SUBSTRING ${subString1} \nSECOND SUBSTRING ${subString2}`);

                               let newString = subString1 + `${average}` + subString2;
                               difference = string.length - newString.length;
                               string = newString;


                           });
                           mod.text = string;

                           // console.log(`FINAL STRING ${string} \n`);
                       } else {
                           mod.optional = true;
                       }

                       // if (count>0) {
                       //     console.log(mod);
                       //     console.log(`----------${count}------\n `);
                       // }
                   }
               })
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

let rollingAveragesArray: any[] = [];
//Gets stashes from GGG API, then filters them
let filterLoop = async () => {
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

        //Filters out stashes that have no items, and stashes not in the currently assigned league
        let leagueStashes = _.filter(response.data.stashes, (stash) => {
            if (stash.public && stash.items.length > 0) {
                return stash.items[0].league === currentLeague;
            } else {
                return false;
            }
        });

        //Prints out how many public, non empty, stashes from the assigned league we got back, mainly for debugging
        // console.log(`Number of harbinger public stashes ${leagueStashes.length}`);

        let uniques: any[] = [];
        //Filter out the unique items
        leagueStashes.forEach((stash) => {
            try {
                stash.items.forEach((item) => {
                    //If the Item IS UNIQUE, ISNT CORRUPTED, IS IDENTIFIED, AND HAS A NOTE
                    if (item.frameType === 3 && !item.corrupted && item.identified && item.note) {

                        let price = item.note.replace('~b/o', '').replace('~price', '').trim();//Replaces the ~b/o and ~price with nothing, trims whitespaces at beginning and end


                        //Removes extra text depending on what currency the item is price in
                        //Trims white spaces
                        //Converts to number
                        //Converts chaos to exalt and other way around and stores them in the item
                        if (price.includes('exa')) {
                            item.exaltedValue = Number(price.replace('exa', '').trim());
                            item.chaosValue = item.exaltedValue * exaltToChaos;


                        } else if (price.includes('chaos')) {
                            item.chaosValue = Number(price.replace('chaos', '').trim());
                            item.exaltedValue = Number((item.chaosValue / exaltToChaos).toFixed(3));

                        } else {
                            item.note = '';
                            item.chaosValue = '';
                            item.exaltedValue = '';
                        }

                        // console.log(JSON.stringify(item));
                        //Trims extra data in the name string not related to the actual name of the item.
                        item.name = item.name.slice(item.name.lastIndexOf('>') + 1);


                        //Count sockets in a group to determine how many links an item has, should be able to deal with reverse 5l's

                        //Socket 0 accounts for normal 5links and 6 links
                        let links: number = 0;
                        if (item.sockets.length > 0) {
                            item.sockets.forEach((socket) => {
                                if (socket.group === 0) {
                                    links++
                                }
                            });
                        }
                        //Socket 1 to account for reverse 5 links
                        if (item.sockets.length > 0 && links <= 1) {
                            links = 0;
                            item.sockets.forEach((socket) => {
                                if (socket.group === 1) {
                                    links++
                                }
                            });
                        }
                        //If less than 5 links default to 0
                        if (links < 5) {
                            links = 0
                        }
                        item.links = links;

                        //Sort vinktar flasks into the right category, using the same format as the variant variable on poe.ninja
                        if (item.name === 'Vessel of Vinktar') {
                            item.explicitMods.forEach((mod) => {
                                if (mod.includes('Spells')) {
                                    item.variant = "Added Spells";
                                } else if (mod.includes('Attacks')) {
                                    item.variant = "Added Attacks";
                                } else if (mod.includes('Penetrates')) {
                                    item.variant = "Penetration";
                                } else if (mod.includes('Converted')) {
                                    item.variant = "Conversion";
                                }
                            });
                            // console.log(JSON.stringify(item));
                            // console.log(item.variant);
                        }
                        //TODO Do comparisons between the average of a mods range
                        //TODO Compare that

                        // Push an items that passed the check to an array

                        pricedUniques.forEach((pricedItem) => {
                            if (pricedItem.name === item.name && pricedItem.links === item.links) {
                                if (item.variant && pricedItem.variant){
                                    if(item.variant === pricedItem.variant){
                                        item.priceRatio = Number((pricedItem.chaosValue/item.chaosValue).toFixed(3));
                                        item.expectedChaos = pricedItem.chaosValue;
                                        item.expectedExalt = Number((pricedItem.chaosValue/exaltToChaos).toFixed(2));
                                        uniques.push(item);
                                        // console.log(JSON.stringify(item));
                                        for (let i = 0; i < item.explicitMods.length; i++){
                                            if (!pricedItem.explicitModifiers[i].optional) {
                                                let itemModsArray: any[] = _.words(item.explicitMods[i]);
                                                let modAverageArray: any[] = _.words(pricedItem.explicitModifiers[i].text);
                                                itemModsArray = _.map(itemModsArray, _.parseInt);
                                                modAverageArray = _.map(modAverageArray, _.parseInt);
                                                itemModsArray = _.remove(itemModsArray, (n) => !!n);
                                                modAverageArray = _.remove(modAverageArray, (n) => !!n);
                                                // console.log(`ITEM MODS NUMBERS ${itemModsArray}\n MOD AVERAGE NUMBERS ${modAverageArray}`);
                                            }
                                        }
                                    }
                                } else {
                                    item.priceRatio = Number((pricedItem.chaosValue/item.chaosValue).toFixed(3));
                                    item.expectedChaos = pricedItem.chaosValue;
                                    item.expectedExalt = Number((pricedItem.chaosValue/exaltToChaos).toFixed(2));
                                    uniques.push(item);
                                    // console.log(JSON.stringify(item));
                                    for (let i = 0; i < item.explicitMods.length; i++){
                                        if (!pricedItem.explicitModifiers[i].optional) {
                                            let itemModsArray: any[] = _.words(item.explicitMods[i]);
                                            let modAverageArray: any[] = _.words(pricedItem.explicitModifiers[i].text);
                                            itemModsArray = _.map(itemModsArray, _.parseInt);
                                            modAverageArray = _.map(modAverageArray, _.parseInt);
                                            itemModsArray = _.remove(itemModsArray, (n) => !!n);
                                            modAverageArray = _.remove(modAverageArray, (n) => !!n);
                                            // console.log(`ITEM MODS NUMBERS ${itemModsArray}\n MOD AVERAGE NUMBERS ${modAverageArray}`);
                                        }
                                    }


                                }
                            }

                        })
                    }
                });
            } catch (e) {
                console.log(e);
            }
        });

        console.log('////');
        console.log(`Number of items in the uniques array ${uniques.length}`);

        //Assigns a new ID based on what is received in the response
        let nextId = response.data.next_change_id;

        //Check if theres a new stash ID
        if (nextId!==latestID) {
            latestID = nextId;

            console.log(`Next change id: ${nextId}`);
            console.log(`Time it took to execute Get request: ${endTimeGet.toFixed(2)}s`);
        } else {
            console.log(`Reached end of stash stream`);
            console.log(`Next change id: ${nextId}`);
            console.log(`Time it took to execute Get request: ${endTimeGet}s`);
        }

        //End timing for the rest of the function
        let endTimeGeneral = (Date.now() - startTime)/1000;
        console.log(`Time it took to executethe whole thing: ${endTimeGeneral.toFixed(2)}s`);
        let number = 50;
        if (rollingAveragesArray.length < number) {
            rollingAveragesArray.push(endTimeGeneral);
        } else {
            rollingAveragesArray.shift();
            rollingAveragesArray.push(endTimeGeneral);
        }
        let average = 0;
        let k = 0;
        rollingAveragesArray.forEach((time) => {
            average += time;
            k++;
        });
        let rollingAverage = average/k;
        // console.log(rollingAveragesArray);
        console.log(`Moving average time it took to execute the last ${k}: ${rollingAverage.toFixed(2)}s`);
        console.log('////\n');
        await setTimeout(filterLoop, 1001);

    } catch (e) {

        console.log(e);


    }

};

let latestID: string;

getLatestID().then((id) => {
    latestID = id;
    // let latestID = '0';
    getUniquePrices().then((filteredUniques) => {
        pricedUniques = filteredUniques;
        // console.log(pricedUniques.length);
        getCurrencyToChaosRatio('Exalted Orb').then((ratio) =>{
            exaltToChaos = ratio;
            filterLoop();
            // console.log(exaltToChaos);
        });
    });

});


app.listen(port, () => console.log(`Started on port ${port}`));