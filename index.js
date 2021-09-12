const express = require("express");
const app = express();


const port = parseInt(process.argv[2]) || process.env.PORT || 80
var unirest = require("unirest");
var ejs = require("ejs");
const CC = require('currency-converter-lt')

accessToken = "REDACTED"

OWMAccessKey = "REDACTED"

mapAccessToken = "REDACTED"

app.use(express.static("public"));

var lastAmadeusTokenTime = null;

var airports = require('airport-codes');

// Default routing, serve index.html
app.get('/', (req, res) => {

    // Send index.html file to front-end
    res.sendFile("/index.html", { root: __dirname });

});


// Routing to display data after the user enters their information
app.get('/main', async (req, res) => {

    console.log(req.query);

    // Get values from the request query
    
    var startDate = req.query.startDate;
    var endDate = req.query.endDate;
    var numTravelers = req.query.numTravelers;
    var currency = req.query.currency;
    
    var startCountry = req.query.originCountry;
    var endCountry = req.query.destCountry;

    var startCity = req.query.originCity;
    var endCity = req.query.destCity;
    var startCoords = {latitude: req.query.originLat, longitude: req.query.originLng}
    var endCoords = {latitude: req.query.destLat, longitude: req.query.destLng}

    var startCountryName = req.query.startCountryName;
    var endCountryName = req.query.endCountryName;



    console.log(endCity);
    console.log(startCity);

    // If numTravelers was not entered, default to 1
    if (numTravelers == "") {
        numTravelers = 1;
    } 
 
    var currencyCode;
 
    // Get the correct currency code based on the currency symbol
    switch(currency) {
        case "€": currencyCode = "EUR"; break;
        case "$": currencyCode = "USD"; break;
        case "£": currencyCode = "GBP"; break;
        case "¥": currencyCode = "JPY"; break;
        default: currencyCode = "USD"; currency = "$"; break; // Default to dollars
    }
    
    // Datetime variable to track the service times of our API requests
    var startTime = new Date();

    // Get the latitude, longitude, and city code for the start and end locations from the Amadeus API
    
    // // Get lat and long from api data
    // var startCoords = startData.geo;
    // var endCoords = endData.geo;
    

    // Get city codes from api data
    var startData = await getLatLongAndCodeFromCityName(startCity, startCountry); // Change this to only get code?
    var endData = await getLatLongAndCodeFromCityName(endCity, endCountry);
    var startCityCode = startData.code;
    var endCityCode = endData.code;

    console.log(startCityCode);
    console.log(endCityCode);

    currentTime = new Date();
    console.log("Got coords data", currentTime - startTime);

    
    
    // Get driving information from MapBox API
    var drivingInfo = await getDrivingInfoBetweenCities(startCoords, endCoords);
    var gotDrivingInfo = false;

    if(drivingInfo != null && typeof(drivingInfo.duration != "undefined")) {
        gotDrivingInfo = true;
        var drivingTime = drivingInfo.duration;

        // Convert distance from meters to miles
        var drivingDistance = parseFloat(drivingInfo.distance) * 0.000621371;
        var mapCoordinates = drivingInfo.geometry.coordinates;

        // Estimate the price of gasoline for the trip
        var drivingPrice = calculateDrivingPrice(drivingDistance);

        
        // Convert driving price from dollars to selected currency
        if(currencyCode != "USD") {
            var currencyConverter = new CC();
            await currencyConverter.from("USD").to(currencyCode).amount(drivingPrice).convert().then((response) => {
                drivingPrice = response;
            })
        }
    }
    else {
        console.log("Fake driving data")
        var drivingTime = 0;
        var drivingDistance = 0;
        var drivingPrice = 0;
        var mapCoordinates = [[startCoords.longitude, `${startCoords.latitude}`], [`${endCoords.longitude}`, `${endCoords.latitude}`]];
        // Didn't get driving info back
        // gotDrivingInfo is already false
    }

    


    var currentTime = new Date();
    console.log("Got driving time", currentTime - startTime);

    // currentTime = new Date();
    // console.log("Got covid data", currentTime - startTime);

    

    // var weatherData = await getWeatherDataFromCoordinates(coords.latitude, coords.longitude)
    // weatherData = weatherData.current.temp; // This must happen after the await or it does not work
    
    // Get forecasted weather data using the coordinates of the destination city and date
    //var weatherData = await getWeatherForcast(endCoords.latitude, endCoords.longitude, startDate);
    var weatherData = await getWeatherDataFromCoordinates(endCoords.latitude, endCoords.longitude);

    if(typeof(weatherData) == "undefined") {
        weatherData = require('./backups/weatherbackup.json')
    }

    weatherData = weatherData.daily;

    //var poiData = await getPointsOfInterest(endCoords);
    // weatherData.forEach((day) => {
    //     day.dt = (new Date(parseInt(day.dt))).toDateString()
    // })
    currentTime = new Date();
    console.log("Got weather data", currentTime - startTime);

    // Find flights between the two cities
    var flights = await findFlights(startCityCode, endCityCode, startDate, endDate, currencyCode, numTravelers);


  //  console.log(flights)

    if(typeof(flights.data) == "undefined") {

        if(startCity == "Munich" && endCity == "Mumbai"){
            flights = require('./backups/MunichToMumbai.json');
            console.log("Using Munich to Mumbai backup data")
        }
        else if(startCity == "New York" && endCity == "Madrid") {
            flights = require('./backups/NewYorkToMadrid.json');
            console.log("Using New York To Madrid backup data")
        }
        else {
            flights = require('./backups/flightsbackup.json')
            console.log("Using Default backup data")
        }

        console.log(flights)
    }

    currentTime = new Date();
    console.log("Got flights data", currentTime - startTime);

   
    // Parse flights response for relevant data
    var flightsData = []
    var flightsArr = flights.data;


    // Data to render main.ejs with
    
    var news = await getNewsOfCountry(endCountry);

    currentTime = new Date();
    console.log("Got news data", currentTime - startTime);

    var newCovidData = await getCovidDataFromCountry(endCountry);

    currentTime = new Date();
    console.log("Got new covid data", currentTime - startTime);

    // var temp = []
    // for(var i=1; i<newCovidData.length; i++) {
    //     temp.push({x: newCovidData[i].x, y: (newCovidData[i].y - newCovidData[i-1].y)})
    // }
    // newCovidData = temp;
    // console.log(temp.length)

    //var interests = await getPointsOfInterest(endCoords);

    parsedData = parseNewFlightData(flightsArr, startData, endData);
    parsedData = putCheapestAndFastestAtFront(parsedData);

    var currentTime = new Date();
    console.log("Parsed flight data", currentTime - startTime);
    

    parsedData = await updateAirlineNamesAndLinks(parsedData);


    // parsedData = await updateAirportNamesAndCoords(parsedData);
    parsedData = updateAirportNamesAndCoords(parsedData);

    var currentTime = new Date();
    console.log("Updated airline names and links", currentTime - startTime);

    parsedData = parsedData.slice(0,8);

    var pois = await getPointsOfInterest(endCoords);

    var currentTime = new Date();
    console.log("Got POI data", currentTime - startTime);

    pois = pois.features;

    pois = pois.slice(0,9);

    for (let i = 0; i < pois.length; i++) {
        pois[i] = await getPOIdata(pois[i].properties.xid);
        if(typeof(pois[i].preview) == 'undefined') {
            pois[i].preview = {source: ""}
        }
        if(typeof(pois[i].wikipedia_extracts) == 'undefined' || typeof(pois[i].wikipedia_extracts.html) == 'undefined') {
            pois[i].wikipedia_extracts = {html: "<b>No Wikipedia Extract Available</b>"}
        }
        if(typeof(pois[i].preview) == 'undefined' || pois[i].preview.source == "") {
             pois[i].preview = {source: "https://imgur.com/WWBP2zX.png"};
        }
    }
    
    
    var requestData = {
        whereTo: endCity,
        whereFrom: startCity,
        startDate: startDate,
        endDate: endDate,
        numTravelers: numTravelers,
        maxCost: 0,
        currency: currency,
        originCountry: startCountry,
        destCountry: endCountry,
        drivingTime: `${Math.floor(drivingTime/(60*60))} Hours, ${Math.round(drivingTime/60) % 60} Minutes`,
        drivingPrice: drivingPrice.toFixed(2),
        drivingDistance: drivingDistance.toFixed(2),
        weatherData: weatherData,
        news : news,
        newCovidData : newCovidData,
        mapCoordinates : mapCoordinates,
        pois: pois,
        flightData: parsedData,
        startAddress: req.query.startAddress,
        endAddress: req.query.endAddress,
        fontState: req.query.fontState,
        darkContrastState: req.query.darkContrastState,
        startCountryName: startCountryName,
        endCountryName: endCountryName,
        gotDrivingInfo: gotDrivingInfo

    }
    
    if(gotDrivingInfo) {
        // TODO put the driving stuff in here, but will it crash ejs if no values are defined?
    }
    
    // Render main.ejs and send the data to the front-end
    ejs.renderFile("main.ejs", requestData, (err, data) => {
        console.log(err);
        res.send(data);
    });

})

// Estimate driving price with average car statistics
function calculateDrivingPrice(drivingDistance, milesPerGallon = 25, pricePerGallon = 5) {

    return (drivingDistance / milesPerGallon) * pricePerGallon;
}

// Convert a formatted time string into a number of minutes
function parseTimeString(flightDuration){
    if(flightDuration.startsWith("PT")) {
        flightDuration = flightDuration.substring(2);
    }

    var hIndex = flightDuration.indexOf('H');
    var mIndex = flightDuration.indexOf('M');

    var hours = 0;
    var minutes = 0;
    if(hIndex != -1) {
        hours = parseInt(flightDuration.substring(0,hIndex));
    }
    if(mIndex != -1) {
        var minutes = parseInt(flightDuration.substring(hIndex + 1,mIndex));
    }

    return hours * 60 + minutes;

}


// Get information about a driving route between coordinates
async function getDrivingInfoBetweenCities(city1coords, city2coords) {

    var ret = null;

    await unirest.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${city1coords.longitude}%2C${city1coords.latitude}%3B${city2coords.longitude}%2C${city2coords.latitude}`)
        .query({
            alternatives: "false",
            geometries: "geojson",
            steps: "true",
            access_token: mapAccessToken
        })
        .then( (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));
            ret = responseJSON.body.routes[0];
        })
        .catch(err => {
            console.log(err);
        })

    return ret;

}


// Begin listening on the specified port
app.listen(port, async () => {
    console.log(`Travel Ahoy is istening at http://localhost:${port}`);
});


// Gets a new access token from Amadeus and sets the global accessToken variable
async function getAmadeusAccessToken() {

    var now = new Date();

    // If the token is still valid, don't refresh it
    if(lastAmadeusTokenTime != null && (now - lastAmadeusTokenTime) <= (1700 * 1000)) {
        return;
    }

    // If there is no valid token, get a new one from Amadeus
    await unirest.post("https://test.api.amadeus.com/v1/security/oauth2/token")
        .headers({"Content-type": "application/x-www-form-urlencoded"})
        .send({"grant_type": "client_credentials", "client_id": "REDACTED", "client_secret": "REDACTED"})
        .then((response) => {

            responseJSON = JSON.parse(JSON.stringify(response));
            accessToken = responseJSON.body.access_token
            lastAmadeusTokenTime = new Date();
    })

}

async function getPointsOfInterest(city2coords) {
    var ret = null;

    var apiKey = "REDACTED";
    var xid;

    await unirest.get(`https://api.opentripmap.com/0.1/en/places/radius?radius=8000&lon=${city2coords.longitude}&lat=${city2coords.latitude}&limit=10&apikey=${apiKey}`)
    .then(async (response) => {
        responseJSON = JSON.parse(JSON.stringify(response));

        ret = responseJSON.body;
    }).catch(err => {
        console.log(err);
    })

    return ret;

}

async function getPOIdata(xid){
    var ret = null;

    var apiKey = "REDACTED";

    await unirest.get(`https://api.opentripmap.com/0.1/en/places/xid/${xid}?apikey=5ae2e3f221c38a28845f05b66a2bc3086a0036d4784ecb092b21d888`)
    .then(async (response) => {
        responseJSON = JSON.parse(JSON.stringify(response));

        ret = responseJSON.body;
    }).catch(err => {
        console.log(err);
    })

    return ret;
}


// Get weather data from latitude and longitude
async function getWeatherDataFromCoordinates(lat, long, exclude="minutely,hourly,alerts") {

    var ret = null;

    await unirest.get("https://api.openweathermap.org/data/2.5/onecall")
        .query( {
            lat: lat,
            lon: long,
            units: "imperial",
            exclude: exclude,
            appid: OWMAccessKey
        })
        .then(async (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));

   //         console.log(responseJSON)

            ret = responseJSON.body;
        })

    return ret

}

// Get the coordinates and city code from a city name and country code
async function getLatLongAndCodeFromCityName(cityName, countryCode="US") {
    // Ensure that there is a valid Amadus access token
    await getAmadeusAccessToken()

    // Return value
    var geo = null;

    // Create GET request to location lookup endpoint
    await unirest.get("https://test.api.amadeus.com/v1/reference-data/locations")
        .header("authorization", "Bearer " + accessToken)
        .query({
            subType: "CITY",
            keyword: cityName,
            countryCode: countryCode,  //ISO 3166-1 alpha-2 form  (TODO: change country code based on user input)
        })
        .then((response) => {

            // Parse response
            responseJSON = JSON.parse(JSON.stringify(response));

            // Set return value
            try {
                geo = responseJSON.body.data[0].geoCode;
                code = responseJSON.body.data[0].iataCode;
                timezoneOffset = responseJSON.body.data[0].timeZoneOffset;
                //"timeZoneOffset": "+02:00"
            }
            catch(err) {
                console.log("Error getting coordinates")
                console.log(response.raw_body);
                console.log(err);
                geo = {latitude: 29.7604, longitude: -95.3698};
                code = "HOU";
            }
        })
        .catch(err => {
            console.log(err)
          })

    return {geo: geo, code: code, timezoneOffset: timezoneOffset}
}

async function getAirlineNamesFromCarrierCodes(carrierCode) {
    // Ensure that there is a valid Amadus access token
    await getAmadeusAccessToken()

    var ret = {};

    await unirest.get("https://test.api.amadeus.com/v1/reference-data/airlines")
        .header("authorization", "Bearer " + accessToken)
        .query({
            airlineCodes: carrierCode
        })
        .then((response) => {

            for(var i=0; i<response.body.data.length; i++) {
                ret[response.body.data[i].iataCode] = response.body.data[i].businessName;
            }
        })
        .catch(err => {
            console.log(err);
        })

    return ret;
}


function getNameFromCode(countryName) {
    
    var countries = require("./backups/countryCodesFromNames.json")
    if (countries.hasOwnProperty(countryName)) {
        return countries[countryName];
    } else {
        return countryName;
    }
}

// Get news for country
async function getNewsOfCountry(countryID) {

    var ret = null;
   // let countryID = getNameFromCode(countryName)
    let apiKey = "REDACTED"

    await unirest.get(`https://newsapi.org/v2/top-headlines?country=${countryID}&apiKey=${apiKey}`)
        .then( (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));
            ret = responseJSON.body.articles;
        })
        .catch (err => {
            console.log(err);
        });

    return ret

}
async function getCovidDataFromCountry(countryName, days = 150){
    var ret = null;
    var data = [];
    //last number the days of
    await unirest.get(`https://corona.lmao.ninja/v2/historical/${countryName}/mainland?lastdays=${days}`)
        .then( (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));
            ret = responseJSON.body;

            // for(var i=0; i<ret.timeline.cases.length; i++) {
            //     data.push({x: new Date("i"), y: "asdf"})
            // }\

            if(typeof(ret.timeline) == 'undefined') {
                data = [{x:0,y:0}]
                return;
            }

            for (const [key, value] of Object.entries(ret.timeline.cases)) {
                
                // data.push({x: new Date(key), y : value});
                data.push({x:key, y : value});
            }
            // for(var key in ret.timeline.cases){
            //     data.push({x: new Date(key), y : value});
            // }
        })

        
        // '2/22/21': 28230970,
        // [{ x: new Date(2017, 0, 3), y: 650 },]
        
    //    console.log(data);
    return data;
}

async function findFlights(startCityCode, endCityCode, departureDate, returnDate, currencyCode, adults=1, onlyNonStop = false, max=50) {

    var ret = null

    var query = {
        originLocationCode: startCityCode,
        destinationLocationCode: endCityCode,
        departureDate: departureDate,
        adults: adults,
        currencyCode: currencyCode,
     //   returnDate: returnDate,
        nonStop: onlyNonStop,
        max: max
    }

    if (returnDate != null && returnDate != "") {
        query.returnDate= returnDate;
    }

    // Ensure that there is a valid Amadus access token
    await getAmadeusAccessToken()

    await unirest.get("https://test.api.amadeus.com/v2/shopping/flight-offers")
        .header("authorization", "Bearer " + accessToken)
        .query(query)
        .then(async (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));

            ret = responseJSON.body;
        }).catch(err => {
            console.log(err)
          })

    return ret;
}

function parseNewFlightData(flightData, startCity, endCity) {


    let parsedData = []

    flightData.forEach((offer) => {

        let parsedOffer = {}
        parsedOffer.offerPrice = offer.price.total;
        parsedOffer.offerID = offer.id;
        parsedOffer.isFastestTrip = false;
        parsedOffer.isCheapestTrip = false;
        parsedOffer.itineraries = [];

        parsedOffer.coords = []


        offer.itineraries.forEach((itinerary) => {

            let parsedItinerary = {}
            // parsedItinerary.itineraryDuration = parseTimeString(itinerary.duration);
             parsedItinerary.itineraryDuration = parseTimeString(itinerary.duration);
            parsedItinerary.segments = []

            itinerary.segments.forEach((segment, segmentNum) => {

                let parsedSegment = {}

                parsedSegment.departureIataCode = segment.departure.iataCode;
           //     parsedSegment.departureTimeString = segment.departure.at;\

                departureCityOffset = parseInt(startCity.timezoneOffset.substring(1,startCity.timezoneOffset.indexOf(":")))
                 if(startCity.timezoneOffset.charAt(0) == "-") {
                     departureCityOffset *= -1;
                 }
                 arrivalCityOffset = parseInt(endCity.timezoneOffset.substring(1,endCity.timezoneOffset.indexOf(":")))
                 if(endCity.timezoneOffset.charAt(0) == "-") {
                     arrivalCityOffset *= -1;
                 }
                parsedSegment.departureDateTime = new Date(segment.departure.at);
                parsedSegment.departureDateTime.setHours(parsedSegment.departureDateTime.getHours() + departureCityOffset)
                parsedSegment.arrivalIataCode = segment.arrival.iataCode;
                parsedSegment.arrivalDateTime = new Date(segment.arrival.at);
                parsedSegment.arrivalDateTime.setHours(parsedSegment.arrivalDateTime.getHours() + arrivalCityOffset);
                parsedSegment.segmentCarrierCode = segment.carrierCode;
                parsedSegment.segmentDuration = parseTimeString(segment.duration);

                parsedItinerary.segments.push(parsedSegment);
            })
            parsedOffer.itineraries.push(parsedItinerary)
        })

        parsedData.push(parsedOffer);

    })

    return parsedData;

}

function putCheapestAndFastestAtFront(flightData) {
    
   // var fastestTrip = flightData[0];
  //  var cheapestTrip = flightData[0];

    var fastestTrip = null;
    var cheapestTrip = null;

    flightData.forEach((offer) => {
        let combinedTime = 0;
        offer.itineraries.forEach((itinerary) => {
            combinedTime += itinerary.itineraryDuration
        })

        offer.combinedTime = combinedTime;
        
        if(fastestTrip == null || offer.combinedTime < fastestTrip.combinedTime) {
            fastestTrip = offer;
        }
        if(cheapestTrip == null || parseFloat(offer.offerPrice) < parseFloat(cheapestTrip.offerPrice)) {
            cheapestTrip = offer;
        }

    })

    fastestTrip.isFastestTrip = true;
    cheapestTrip.isCheapestTrip = true;

    flightData.unshift(
        flightData.splice(
            flightData.map(function(e){return e.offerID}).indexOf(fastestTrip.offerID),
        1)[0]
    )
    flightData.unshift(
        flightData.splice(
            flightData.map(function(e){return e.offerID}).indexOf(cheapestTrip.offerID),
        1)[0]
    )
    return flightData;

}

async function updateAirlineNamesAndLinks(flightData) {
    // var airportCodesSet = new Set();
    var carrierCodesSet = new Set();

    flightData.forEach((offer) => {
        offer.itineraries.forEach((itinerary) => {
            itinerary.segments.forEach((segment) => {
                carrierCodesSet.add(segment.segmentCarrierCode);
            })
        })
    })

    var carrierCodesString = ""
    for(let item of carrierCodesSet) {
        carrierCodesString += (item + ",");
    }
    carrierCodesString = carrierCodesString.slice(0, -1);

    var links = await getLinks(carrierCodesSet);
    var airlineNames = await getAirlineNamesFromCarrierCodes(carrierCodesString);

    flightData.forEach((offer) => {
        offer.itineraries.forEach((itinerary) => {
            itinerary.segments.forEach((segment) => {
                segment.carrierLink = links[segment.segmentCarrierCode];
                segment.segmentCarrierCode = airlineNames[segment.segmentCarrierCode];
            })
        })
    })

    return flightData;
    
}

async function getLinks(carrierCodesSet) {

    var links = {}

    for(let item of carrierCodesSet) {

        await unirest.get("https://test.api.amadeus.com/v2/reference-data/urls/checkin-links")
        .header("authorization", "Bearer " + accessToken)
        .query({
            airlineCode: item
        })
        .then(async (response) => {
            responseJSON = JSON.parse(JSON.stringify(response));

            links[item] = responseJSON.body.data[0].href;
            
        }).catch(err => {
        //    console.log(err)
            
            links[item] = 'www.google.com'
          })
    }


    return links;


}

function updateAirportNamesAndCoords(flightData) {
    var airportCodesSet = new Set()
    var airportCodesDict = {}

    
    flightData.forEach((offer) => {

        offer.itineraries.forEach((itinerary) => {

            itinerary.segments.forEach((segment) => {
                airportCodesSet.add(segment.arrivalIataCode)
                airportCodesSet.add(segment.departureIataCode)
            });
        });
    });

    for(let item of airportCodesSet ) {
        var port = airports.findWhere({iata: item})
        airportCodesDict[item] = {fullAirportName: port.get('name'), coords:[port.get('longitude'), port.get('latitude')]}
    }

    flightData.forEach((offer) => {

        offer.offerCoords = []

        offer.itineraries.forEach((itinerary) => {

            itinerary.segments.forEach((segment, segmentNum) => {

                if (segmentNum == 0) {
                    offer.offerCoords.push(airportCodesDict[segment.departureIataCode].coords)
                }
                offer.offerCoords.push(airportCodesDict[segment.arrivalIataCode].coords)


                segment.arrivalAirportName = airportCodesDict[segment.arrivalIataCode].fullAirportName;
                segment.departureAirportName = airportCodesDict[segment.departureIataCode].fullAirportName;


            });
        });
    });

    return flightData;
}