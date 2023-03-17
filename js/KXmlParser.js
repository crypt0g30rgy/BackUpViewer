var NUMBER_COMPARISION_LENGTH = 8;

self.addEventListener('message', function (e) {
    var data = e.data;
    switch (data.cmd) {
        case "readAllRecords":
            readAllRecords(data.files[0], data.number, data.sortOrder, data.loadMedia, data.startDate, data.endDate);
            break;
        case "readAllConversations":
            readAllConversations(data.files[0], data.sortOrder);
            break;
        case "readBinaryData":
            loadBinaryContent(data.files[0], data.messageIndex, data.partIndex);
            break;
        case "loadAllMediaForDownload":
            loadAllMediaForDownload(data.files[0], data.number, data.startDate, data.endDate);
            break;
        case "loadAllForCache":
            loadAllForCache(data.files[0], data.sortOrder, data.loadMedia, data.startDate, data.endDate);
            break;
    }
}, false);

self.addEventListener('unhandledrejection', function (event) {
    // the event object has two special properties:
    // event.promise - the promise that generated the error
    // event.reason  - the unhandled error object
    throw event.reason;
});

function htmlEscape(str) {
    if (!str)
        return "";

    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

//TODO Move all sorting to BackupViewer.js
function sortDateReverse(a, b) {
    if (a.date < b.date)
        return 1;
    if (a.date > b.date)
        return -1;
    return 0;
}

function sortDate(a, b) {
    if (a.date < b.date)
        return -1;
    if (a.date > b.date)
        return 1;
    return 0;
}

/**
 * Function to sort Contacts by the searchAddress
 * @param {any} a
 * @param {any} b
 */
function sortContactsBySearchAddress(a, b) {
    if (a.searchAddress < b.searchAddress)
        return -1;
    if (a.searchAddress > b.searchAddress)
        return 1;
    return 0;
}

function sortContactsByLastDateReverse(a, b) {
    if (a.lastDate < b.lastDate)
        return 1;
    if (a.lastDate > b.lastDate)
        return -1;
    return 0;
}

function sortContactsByLastDate(a, b) {
    if (a.lastDate < b.lastDate)
        return -1;
    if (a.lastDate > b.lastDate)
        return 1;
    return 0;
}


/**
 * Performs a binary search to get the contact from the array
 * @param {any} contacts The contacts array
 * @param {any} fixedNumber The number to search for
 */
function getContact(contacts, fixedNumber) {

    let start = 0, end = contacts.length - 1;
    while (start <= end) {
        let mid = Math.floor((start + end) / 2);
        if (contacts[mid].searchAddress === fixedNumber) {
            return contacts[mid];
        } else if (contacts[mid].searchAddress < fixedNumber) {
            start = mid + 1;
        } else {
            end = mid - 1;
        }
    }

    return null;
}

function getFixedNumber(number) {
    if (number && number.indexOf("~") < 0) {
        return fixNumber(number);
    }

    return number;
}

function fixNumber(numberString) {
    numberString = numberString.replace(/ |-|\)|\(/g, ""); //replace space, - , ( and )
    if (numberString.length > NUMBER_COMPARISION_LENGTH) {
        numberString = numberString.substring(numberString.length - NUMBER_COMPARISION_LENGTH);
    }
    return numberString;
}

function updateContactList(contacts, contactNumber, messageDate, contactName) {
    if (!contactNumber) {
        return;
    }
    let fixedNumber = getFixedNumber(contactNumber);
    var contact = getContact(contacts, fixedNumber);

    if (contact == null) {
        contact = { name: contactName, number: contactNumber, firstDate: messageDate, lastDate: messageDate, count: 1, searchAddress: fixedNumber };
        contacts.push(contact)
        contacts.sort(sortContactsBySearchAddress) // Sort it so that we can easily perform a binary search
    } else {
        if (contact.firstDate > messageDate) {
            contact.firstDate = messageDate;
        }
        if (contact.lastDate < messageDate) {
            contact.lastDate = messageDate;
        }
        contact.count++;
    }
}

function addRecord(records, recordType, recordDate, recordContent, contactName, contactNumber) {
    var record = { type: recordType, date: recordDate, content: recordContent, name: contactName, number: contactNumber };
    records.push(record);
}

function areNumbersSame(first, second) {
    if (first == second) {
        return true;
    }

    first = getFixedNumber(first);
    second = getFixedNumber(second);

    if (first == second) {
        return true;
    }
}

function isDateInRange(recordDate, startDate, endDate) {
    if (!recordDate) {
        return true;
    }
    if (startDate) {
        if (endDate) {
            return startDate <= recordDate && endDate >= recordDate;
        }
        return startDate <= recordDate;
    } else if (endDate) {
        return endDate >= recordDate;
    }
    return true;
}

function readAllConversations(file, sortOrder) {
    var parser = new KXmlParser();
    parser.setIgnoreBinaryData(true);
    parser.setInput(file);
    var eventType = parser.getEventType();
    var contacts = [];
    var recordCount = 10000;
    var recordIndex = -1;
    var fileContents = "";
    var fileFirstDate = Number.MAX_VALUE;
    var fileLastDate = 0;

    while (eventType != KXmlParser.END_DOCUMENT) {
        var name = null;
        switch (eventType) {
            case KXmlParser.START_TAG: {
                name = parser.getName();
                switch (name) {
                    case "smses":
                        fileContents = "messages";
                        var countString = parser.getAttributeValue("", "count");
                        if (countString) {
                            recordCount = parseInt(countString);
                        }
                        break;
                    case "calls":
                        var countString = parser.getAttributeValue("", "count");
                        if (countString) {
                            recordCount = parseInt(countString);
                        }
                        fileContents = name;
                        break;
                    case "sms":
                    case "mms":
                        recordIndex++;
                        var dateValue = parser.getAttributeValue("", "date");
                        if (dateValue) {
                            updateContactList(contacts,
                                parser.getAttributeValue("", "address"),
                                dateValue,
                                htmlEscape(parser.getAttributeValue("", "contact_name")));
                            if (fileFirstDate > dateValue) {
                                fileFirstDate = dateValue;
                            }
                            if (fileLastDate < dateValue) {
                                fileLastDate = dateValue;
                            }
                        }
                        postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                        break;
                    case "call":
                        recordIndex++;
                        var dateValue = parser.getAttributeValue("", "date");
                        if (dateValue) {
                            updateContactList(contacts,
                                parser.getAttributeValue("", "number"),
                                dateValue,
                                htmlEscape(parser.getAttributeValue("", "contact_name")));
                            if (fileFirstDate > dateValue) {
                                fileFirstDate = dateValue;
                            }
                            if (fileLastDate < dateValue) {
                                fileLastDate = dateValue;
                            }
                        }
                        postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                        break;
                }
            }
        }
        eventType = parser.next();
    }
    if (sortOrder == "Asc") {
        contacts.sort(sortContactsByLastDate);
    } else {
        contacts.sort(sortContactsByLastDateReverse);
    }
    var allContacts = { name: "All " + fileContents, number: "", firstDate: fileFirstDate, lastDate: fileLastDate, count: recordIndex + 1, searchAddress: "" };
    contacts.unshift(allContacts);
    postMessage({ name: "FINISHED_CONVERSATIONS", data: { file_contents: fileContents, file_contacts: contacts } });
}

async function loadAllForCache(file, sortOrder, loadMedia, startDate, endDate) {
    var parser = new KXmlParser();
    parser.setIgnoreBinaryData(false);
    parser.setInput(file);
    var eventType = parser.getEventType();
    var contacts = [];
    var recordCount = 10000;
    var recordIndex = -1;
    var fileContents = "";
    var currentCount = 0;
    var fileFirstDate = Number.MAX_VALUE;
    var fileLastDate = 0;

    while (eventType != KXmlParser.END_DOCUMENT) {
        var name = null;
        switch (eventType) {
            case KXmlParser.START_TAG: {
                name = parser.getName();
                switch (name) {
                    case "smses":
                        fileContents = "messages";
                        var countString = parser.getAttributeValue("", "count");
                        if (countString) {
                            recordCount = parseInt(countString);
                        }
                        break;
                    case "calls":
                        var countString = parser.getAttributeValue("", "count");
                        if (countString) {
                            recordCount = parseInt(countString);
                        }
                        fileContents = name;
                        break;
                    case "sms":
                        recordIndex++;
                        var address = parser.getAttributeValue("", "address");
                        var dateValue = parser.getAttributeValue("", "date");
                        var nameValue = htmlEscape(parser.getAttributeValue("", "contact_name"));
                        if (dateValue && isDateInRange(dateValue, startDate, endDate)) {
                            updateContactList(contacts, address, dateValue, nameValue);
                            if (fileFirstDate > dateValue) {
                                fileFirstDate = dateValue;
                            }
                            if (fileLastDate < dateValue) {
                                fileLastDate = dateValue;
                            }

                            var messageBox = parser.getAttributeValue("", "type");
                            var messageTypeDisplay = "";
                            switch (messageBox) {
                                case "1":
                                    messageTypeDisplay = "Received";
                                    break;
                                case "2":
                                    messageTypeDisplay = "Sent";
                                    break;
                                case "3":
                                    messageTypeDisplay = "Draft";
                                    break;
                                default:
                                    messageTypeDisplay = "Unknown";
                                    break;
                            }

                            var record = {
                                type: messageTypeDisplay,
                                date: dateValue,
                                content: htmlEscape(parser.getAttributeValue("", "body")),
                                name: nameValue,
                                address: address,
                                searchAddress: getFixedNumber(address)
                            };
                            postMessage({ name: "ADD_CACHE", data: record });
                            currentCount++;
                        }
                        postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                        break;
                    case "mms":
                        recordIndex++;
                        var address = parser.getAttributeValue("", "address");
                        var dateValue = parser.getAttributeValue("", "date");
                        var nameValue = htmlEscape(parser.getAttributeValue("", "contact_name"));

                        if (dateValue && isDateInRange(dateValue, startDate, endDate)) {
                            updateContactList(contacts, address, dateValue, nameValue);
                            if (fileFirstDate > dateValue) {
                                fileFirstDate = dateValue;
                            }
                            if (fileLastDate < dateValue) {
                                fileLastDate = dateValue;
                            }
                            if (address) {
                                var messageBox = parser.getAttributeValue("", "msg_box");
                                var messageTypeDisplay = "";
                                switch (messageBox) {
                                    case "1":
                                        messageTypeDisplay = "Received";
                                        break;
                                    case "2":
                                        messageTypeDisplay = "Sent";
                                        break;
                                    case "3":
                                        messageTypeDisplay = "Draft";
                                        break;
                                    default:
                                        messageTypeDisplay = "Unknown";
                                        break;
                                }

                                var messageType = parser.getAttributeValue("", "m_type");
                                var partBody;
                                if (messageType === "134") {
                                    partBody = "**Message delivery receipt**";
                                } else {
                                    partBody = loadMedia ? getPartBodyFull(parser, recordIndex) : getPartBody(parser, recordIndex); // must be done before parsing addr records for sender
                                }

                                if (address.indexOf("~") > -1 && messageBox == "1") { // its a received group message, find the sender
                                    messageTypeDisplay = messageTypeDisplay + getMmsSender(parser, 0);
                                }

                                var record = {
                                    type: messageTypeDisplay,
                                    date: dateValue,
                                    content: partBody,
                                    name: nameValue,
                                    address: address,
                                    searchAddress: getFixedNumber(address)
                                };
                                postMessage({ name: "ADD_CACHE", data: record });
                                currentCount++;
                            }
                            postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                        }
                        break;
                    case "call":
                        recordIndex++;
                        var address = parser.getAttributeValue("", "number");
                        var dateValue = parser.getAttributeValue("", "date");
                        var nameValue = htmlEscape(parser.getAttributeValue("", "contact_name"));

                        if (dateValue && isDateInRange(dateValue, startDate, endDate)) {
                            updateContactList(contacts, address, dateValue, nameValue);
                            if (fileFirstDate > dateValue) {
                                fileFirstDate = dateValue;
                            }
                            if (fileLastDate < dateValue) {
                                fileLastDate = dateValue;
                            }
                            var callType = parser.getAttributeValue("", "type");
                            var callTypeDisplay = "";
                            switch (callType) {
                                case "1":
                                    callTypeDisplay = "Incoming";
                                    break;
                                case "2":
                                    callTypeDisplay = "Outgoing";
                                    break;
                                case "3":
                                    callTypeDisplay = "Missed";
                                    break;
                                case "4":
                                    callTypeDisplay = "Voicemail";
                                    break;
                                case "5":
                                    callTypeDisplay = "Rejected";
                                    break;
                                case "6":
                                    callTypeDisplay = "Refused list";
                                    break;
                                default:
                                    callTypeDisplay = "Unknown";
                                    break;
                            }

                            var record = {
                                type: callTypeDisplay,
                                date: dateValue,
                                content: parser.getAttributeValue("", "duration") + " seconds",
                                name: nameValue,
                                address: address,
                                searchAddress: getFixedNumber(address)
                            };
                            postMessage({ name: "ADD_CACHE", data: record });
                            currentCount++;
                        }
                        postMessage({ name: "PROGRESS", current: recordIndex, tota: recordCount });
                        break;
                }
            }
        }
        eventType = parser.next();
    }
    if (sortOrder == "Asc") {
        contacts.sort(sortContactsByLastDate);
    } else {
        contacts.sort(sortContactsByLastDateReverse);
    }

    var allContacts = { name: "All " + fileContents, number: "", firstDate: fileFirstDate, lastDate: fileLastDate, count: currentCount, searchAddress: "" };
    contacts.unshift(allContacts);
    postMessage({ name: "FINISHED_CONVERSATIONS", data: { file_contents: fileContents, file_contacts: contacts } });
}

/**
 * Reads records from the file. This is used when caching is disabled.
 * @param {any} file The file
 * @param {any} contactNumber The contact number, if only loading records for a contact. Empty string if all records are to be loaded.
 * @param {any} sortOrder The sort order
 * @param {any} loadMedia If media should be loaded
 * @param {any} startDate Start Date, if filtering by date
 * @param {any} endDate End Date, if filtering by date
 */
function readAllRecords(file, contactNumber, sortOrder, loadMedia, startDate, endDate) {
    var parser = new KXmlParser();
    parser.setIgnoreBinaryData(false);
    parser.setInput(file);
    var eventType = parser.getEventType();

    var recordIndex = -1;
    var records = [];
    var recordCount = 10000;
    var loadAll = contactNumber == "";
    while (eventType != KXmlParser.END_DOCUMENT) {
        var name = null;
        switch (eventType) {
            case KXmlParser.START_TAG: {
                name = parser.getName();
                if (name == "smses" || name == "calls") {
                    var countString = parser.getAttributeValue("", "count");
                    if (countString) {
                        recordCount = parseInt(countString);
                    }
                } else if (name == "call") {
                    recordIndex++;
                    var number = parser.getAttributeValue("", "number");
                    var dateValue = parser.getAttributeValue("", "date");
                    if ((loadAll || areNumbersSame(contactNumber, number)) && isDateInRange(dateValue, startDate, endDate)) {
                        var callType = parser.getAttributeValue("", "type");
                        var callTypeDisplay = "";
                        switch (callType) {
                            case "1":
                                callTypeDisplay = "Incoming";
                                break;
                            case "2":
                                callTypeDisplay = "Outgoing";
                                break;
                            case "3":
                                callTypeDisplay = "Missed";
                                break;
                            case "4":
                                callTypeDisplay = "Voicemail";
                                break;
                            case "5":
                                callTypeDisplay = "Rejected";
                                break;
                            case "6":
                                callTypeDisplay = "Refused list";
                                break;
                            default:
                                callTypeDisplay = "Unknown";
                                break;
                        }
                        addRecord(records, callTypeDisplay, dateValue,
                            parser.getAttributeValue("", "duration") + " seconds",
                            htmlEscape(parser.getAttributeValue("", "contact_name")),
                            number);
                    }
                    postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                } else if (name == "sms") {
                    recordIndex++;
                    var address = parser.getAttributeValue("", "address");
                    var dateValue = parser.getAttributeValue("", "date");
                    if ((loadAll || areNumbersSame(contactNumber, address)) && isDateInRange(dateValue, startDate, endDate)) {
                        var messageBox = parser.getAttributeValue("", "type");
                        var messageTypeDisplay = "";
                        switch (messageBox) {
                            case "1":
                                messageTypeDisplay = "Received";
                                break;
                            case "2":
                                messageTypeDisplay = "Sent";
                                break;
                            case "3":
                                messageTypeDisplay = "Draft";
                                break;
                            default:
                                messageTypeDisplay = "Unknown";
                                break;
                        }
                        addRecord(records, messageTypeDisplay, dateValue,
                            htmlEscape(parser.getAttributeValue("", "body")),
                            htmlEscape(parser.getAttributeValue("", "contact_name")),
                            address);
                    }
                    postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                } else if (name == "mms") {
                    recordIndex++;
                    var address = parser.getAttributeValue("", "address");
                    var dateValue = parser.getAttributeValue("", "date");
                    var nameValue = parser.getAttributeValue("", "contact_name");
                    if (address && (loadAll || areNumbersSame(contactNumber, address)) && isDateInRange(dateValue, startDate, endDate)) {
                        var messageBox = parser.getAttributeValue("", "msg_box");
                        var messageTypeDisplay = "";
                        switch (messageBox) {
                            case "1":
                                messageTypeDisplay = "Received";
                                break;
                            case "2":
                                messageTypeDisplay = "Sent";
                                break;
                            case "3":
                                messageTypeDisplay = "Draft";
                                break;
                            default:
                                messageTypeDisplay = "Unknown";
                                break;
                        }

                        var messageType = parser.getAttributeValue("", "m_type");
                        var partBody;
                        if (messageType === "134") {
                            partBody = "**Message delivery receipt**";
                        } else {
                            partBody = loadMedia ? getPartBodyFull(parser, recordIndex) : getPartBody(parser, recordIndex); // must be done before parsing addr records for sender
                        }

                        if (address.indexOf("~") > -1 && messageBox == "1") { // its a received group message, find the sender
                            messageTypeDisplay = messageTypeDisplay + getMmsSender(parser, 0);
                        }
                        addRecord(records, messageTypeDisplay, dateValue,
                            partBody, nameValue, address);
                    }
                    postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                }
                break;
            }
        }
        eventType = parser.next();
    }
    if (sortOrder == "Asc") {
        records.sort(sortDate);
    } else {
        records.sort(sortDateReverse);
    }
    postMessage({ name: "FINISHED_RECORDS", data: records });
}

function getPartBodyFull(parser, messageIndex) {
    var eventType = parser.next();
    var messageBody = "";
    var partIndex = -1;
    while (eventType != KXmlParser.END_DOCUMENT) {
        name = parser.getName();
        switch (eventType) {
            case KXmlParser.START_TAG: {
                if (name == "part") {
                    partIndex++;
                    var contentType = parser.getAttributeValue("", "ct");
                    if (!contentType) {
                        break;
                    }

                    switch (contentType) {
                        case "application/smil":
                            break;
                        case "text/plain":
                            if (messageBody.length > 0) {
                                messageBody += "<br/>";
                            }
                            messageBody += htmlEscape(parser.getAttributeValue("", "text"));
                            break;
                        default:
                            if (messageBody.length > 0) {
                                messageBody += "<br/>";
                            }
                            // show download link for items we can't display
                            if (contentType == "video/3gpp" ||
                                (contentType.indexOf("image") == -1 && contentType.indexOf("audio") == -1 && contentType.indexOf("video") == -1)) {
                                messageBody += "<a id=\"mmsMediaLink_" + messageIndex + "_" + partIndex + "\" href='javascript:showMedia(" + messageIndex + ", " + partIndex +
                                    ");'>Click to download " + contentType + " </a > " +
                                    "<div id=\"mmsMedia_" + messageIndex + "_" + partIndex + "\" style=\"visibility:hidden\"></div>";
                            } else {
                                var fileName = parser.getAttributeValue("", "cl");
                                messageBody += "<div id=\"mmsMedia_" + messageIndex + "_" + partIndex + "\">" +
                                    readBinaryDataInline(parser, contentType, messageIndex, partIndex, fileName) +
                                    "</div>";
                            }
                            break;
                    }
                } else if (name == "sms" || name == "mms") {
                    return "MMS content could not be loaded";
                }
                break;
            }
            case KXmlParser.END_TAG: {
                if (name == "sms" || name == "mms" || name == "parts") {
                    if (messageBody.length == 0) {
                        messageBody = "MMS content could not be loaded";
                    }
                    return messageBody;
                }
                break;
            }
        }
        eventType = parser.next();
    }
    if (messageBody.length == 0) {
        messageBody = "MMS content could not be loaded";
    }
    return messageBody;
}

function getPartBody(parser, messageIndex) {
    var eventType = parser.next();
    var messageBody = "";
    var partIndex = -1;
    while (eventType != KXmlParser.END_DOCUMENT) {
        name = parser.getName();
        switch (eventType) {
            case KXmlParser.START_TAG: {
                if (name == "part") {
                    partIndex++;
                    var contentType = parser.getAttributeValue("", "ct");
                    if (!contentType) {
                        break;
                    }

                    switch (contentType) {
                        case "application/smil":
                            break;
                        case "text/plain":
                            if (messageBody.length > 0) {
                                messageBody += "<br/>";
                            }
                            messageBody += htmlEscape(parser.getAttributeValue("", "text"));
                            break;
                        default:
                            if (messageBody.length > 0) {
                                messageBody += "<br/>";
                            }
                            var fileAction = "load";
                            // show download link for items we can't display
                            if (contentType == "video/3gpp" ||
                                (contentType.indexOf("image") == -1 && contentType.indexOf("audio") == -1 && contentType.indexOf("video") == -1)) {
                                fileAction = "download";
                            }
                            messageBody += "<a id=\"mmsMediaLink_" + messageIndex + "_" + partIndex + "\" href='javascript:showMedia(" + messageIndex + ", " + partIndex +
                                ");'>Click to " + fileAction + " " + contentType + " </a > " +
                                "<div id=\"mmsMedia_" + messageIndex + "_" + partIndex + "\" style=\"visibility:hidden\"></div>";
                            break;
                    }
                } else if (name == "sms" || name == "mms") {
                    return "MMS content could not be loaded";
                }
                break;
            }
            case KXmlParser.END_TAG: {
                if (name == "sms" || name == "mms" || name == "parts") {
                    if (messageBody.length == 0) {
                        messageBody = "MMS content could not be loaded";
                    }
                    return messageBody;
                }
                break;
            }
        }
        eventType = parser.next();
    }
    if (messageBody.length == 0) {
        messageBody = "MMS content could not be loaded";
    }
    return messageBody;
}

function loadAllMediaForDownload(file, contactNumber, startDate, endDate) {
    var parser = new KXmlParser();
    parser.setIgnoreBinaryData(false);
    parser.setInput(file);
    var eventType = parser.getEventType();

    var recordIndex = -1;
    var records = [];
    var recordCount = 10000;
    var loadAll = contactNumber == "";
    while (eventType != KXmlParser.END_DOCUMENT) {
        var name = null;
        switch (eventType) {
            case KXmlParser.START_TAG: {
                name = parser.getName();
                if (name == "smses" || name == "calls") {
                    var countString = parser.getAttributeValue("", "count");
                    if (countString) {
                        recordCount = parseInt(countString);
                    }
                } else if (name == "call" || name == "sms") {
                    recordIndex++;
                    postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                } else if (name == "mms") {
                    recordIndex++;
                    var address = parser.getAttributeValue("", "address");
                    var dateValue = parser.getAttributeValue("", "date");
                    if (address && (loadAll || areNumbersSame(contactNumber, address)) && isDateInRange(dateValue, startDate, endDate)) {
                        loadMediaForDownload(parser, records, recordIndex, dateValue);
                    }
                    postMessage({ name: "PROGRESS", current: recordIndex, total: recordCount });
                }
                break;
            }
        }
        eventType = parser.next();
    }
    postMessage({ name: "FINISHED_ALL_MEDIA", data: records });
}

function loadMediaForDownload(parser, records, messageIndex, messageDate) {
    var eventType = parser.next();
    var partIndex = -1;
    while (eventType != KXmlParser.END_DOCUMENT) {
        name = parser.getName();
        switch (eventType) {
            case KXmlParser.START_TAG: {
                if (name == "part") {
                    partIndex++;
                    var contentType = parser.getAttributeValue("", "ct");
                    if (!contentType) {
                        break;
                    }

                    switch (contentType) {
                        case "application/smil":
                        case "text/plain":
                            break;
                        default:
                            var fileName = parser.getAttributeValue("", "cl");
                            var body = parser.getAttributeValue("", "data");
                            var record = { name: messageIndex + "_" + partIndex + "_" + fileName, content: body, date: messageDate };
                            records.push(record);
                            break;
                    }
                }
                break;
            }
            case KXmlParser.END_TAG: {
                if (name == "sms" || name == "mms" || name == "parts") {
                    return;
                }
            }
        }
        eventType = parser.next();
    }
}

function getMmsSender(parser, messageIndex) {
    var eventType = parser.next();
    while (eventType != KXmlParser.END_DOCUMENT) {
        name = parser.getName();
        switch (eventType) {
            case KXmlParser.START_TAG: {
                if (name == "addr") {
                    var addressType = parser.getAttributeValue("", "type");
                    if (addressType == "137") {
                        var address = parser.getAttributeValue("", "address");
                        if (address != "insert-address-token") {
                            return "<br/><br/>" + "Sender: " + address;
                        }
                        return "";
                    }
                } else if (name == "sms" || name == "mms") {
                    return "";
                }
                break;
            }
            case KXmlParser.END_TAG: {
                if (name == "sms" || name == "mms" || name == "addrs") {
                    return "";
                }
                break;
            }
        }
        eventType = parser.next();
    }
    return "";
}

function loadBinaryContent(file, messageIndex, partIndex) {
    var parser = new KXmlParser();
    parser.setDeferBinaryDataProcessing(true);
    parser.setInput(file);
    var messageCount = -1;
    var partCount = -1;
    var eventType = parser.getEventType();
    while (eventType != KXmlParser.END_DOCUMENT && messageCount <= messageIndex) {
        var name;
        if (eventType == KXmlParser.START_TAG) {
            name = parser.getName();
            if (name == "sms" || name == "mms") {
                messageCount++;
            }
            if (messageIndex == messageCount && name == "part") {
                partCount++;
                if (partCount == partIndex) {
                    var contentType = parser.getAttributeValue("", "ct");
                    if (contentType != ""
                        && contentType != "application/smil"
                        && contentType != "text/plain") {
                        var fileName = parser.getAttributeValue("", "cl");
                        return readBinaryData(parser, fileName, contentType, messageIndex, partIndex);
                    }
                }
            }
        }
        eventType = parser.next();
    }
}

function readBinaryDataInline(parser, contentType, messageIndex, partIndex, fileName) {
    var downloadLink = "<br /> <a href='javascript:downloadContent(\"mmsMedia_" + messageIndex + "_" + partIndex + "\",\"" + fileName + "\",\"" + contentType + "\");'>Download</a>"
    if (contentType.indexOf("image") == 0) {
        return "<img class=\"backupViewerImage\" src=\"data:" + contentType + ";base64," + parser.getAttributeValue("", "data") + "\"/>" + downloadLink;
    }
    else if (contentType.indexOf("audio") == 0) {
        return "<audio controls  style=\"display:block;\" src=\"data:" + contentType + ";base64," + parser.getAttributeValue("", "data") + "\"></audio>" + downloadLink;
    } else if (contentType.indexOf("video") == 0) {
        if (contentType != "video/3gpp") {
            return "<video controls class=\"backupViewerVideo\"> <source type=\"" + contentType + "\" src=\"data:" + contentType + ";base64," + + parser.getAttributeValue("", "data") + "\"/></video>" + downloadLink;
        }
    }
    return "";
}

function readBinaryData(parser, fileName, contentType, messageIndex, partIndex) {
    if (contentType.indexOf("image") == 0) {
        postMessage({ name: "BINARY_DATA", data: "<img class=\"backupViewerImage\" src=\"data:" + contentType + ";base64," });
        parser.readAndAppendBinaryDataToStream();
        postMessage({ name: "BINARY_DATA", data: "\"/>" });
        postMessage({ name: "FINISHED_BINARY", data: { part_id: messageIndex + "_" + partIndex, file_name: fileName, content_type: contentType } });
    } else if (contentType.indexOf("audio") == 0) {
        postMessage({ name: "BINARY_DATA", data: "<audio controls style=\"display:block;\" src=\"data:" + contentType + ";base64," });
        parser.readAndAppendBinaryDataToStream();
        postMessage({ name: "BINARY_DATA", data: "\"></audio>" });
        postMessage({ name: "FINISHED_BINARY", data: { part_id: messageIndex + "_" + partIndex, file_name: fileName, content_type: contentType } });
    } else if (contentType.indexOf("video") == 0) {
        if (contentType == "video/3gpp") {
            //browsers can't show 3gp files
            parser.readAndSendBinaryDownloadDataToStream(contentType, messageIndex, partIndex, fileName);
        } else {
            postMessage({ name: "BINARY_DATA", data: "<video controls class=\"backupViewerVideo\"> <source type=\"" + contentType + "\" src=\"data:" + contentType + ";base64," });
            parser.readAndAppendBinaryDataToStream();
            postMessage({ name: "BINARY_DATA", data: "\"/></video>" });
            postMessage({ name: "FINISHED_BINARY", data: { part_id: messageIndex + "_" + partIndex, file_name: fileName, content_type: contentType } });
        }
    } else {
        //Unknown datatype, send to download
        parser.readAndSendBinaryDownloadDataToStream(contentType, messageIndex, partIndex, fileName);
    }
}

/**
    * A simple, pull based XML parser. This classe replaces the kXML 1 XmlParser class and the corresponding event classes.
    */
class KXmlParser {
    constructor() {
        this.relaxed = true;
        this.elementStack = new Array(16);
        this.nspStack = new Array(8);
        this.nspCounts = new Array(4);
        this.txtBuf = new Array(128);
        this.attributes = new Array(16);
        this.stackMismatch = 0;
        /**
        * A separate peek buffer seems simpler than managing wrap around in the first level read buffer
        */
        this.__peek = new Array(2);
        this.mIgnoreBinaryData = false;
        this.mDeferBinaryDataProcessing = false;
        this.mFoundBinaryData = false;
        this.processNsp = false;
        this.depth = 0;
        this.srcPos = 0;
        this.srcCount = 0;
        this.line = 0;
        this.column = 0;
        this.txtPos = 0;
        this.type = KXmlParser.START_DOCUMENT;
        this.__isWhitespace = false;
        this.degenerated = false;
        this.attributeCount = 0;
        this.peekCount = 0;
        this.wasCR = false;
        this.unresolved = false;
        this.token = false;
        this.srcBufferSize = 81920;
        this.srcBuf = new Array(this.srcBufferSize);
        this.unicodeEmojiSupported = (typeof String.fromCodePoint === "function"); //some browsers like IE don't support this method
    }

    isProp(n1, prop, n2) {
        if (!(function (str, searchString, position) {
            if (position === void 0) { position = 0; }
            return str.substr(position, searchString.length) === searchString;
        })(n1, "http://xmlpull.org/v1/doc/"))
            return false;
        if (prop)
            return (n1.substring(42) === n2);
        else
            return (n1.substring(40) === n2);
    }

    adjustNsp() {
        var any = false;
        for (var i = 0; i < this.attributeCount << 2; i += 4) {
            var attrName = this.attributes[i + 2];
            var cut_1 = attrName.indexOf(':');
            var prefix = void 0;
            if (cut_1 !== -1) {
                prefix = attrName.substring(0, cut_1);
                attrName = attrName.substring(cut_1 + 1);
            }
            else if ((attrName === "xmlns")) {
                prefix = attrName;
                attrName = null;
            }
            else
                continue;
            if (!(prefix === "xmlns")) {
                any = true;
            }
            else {
                var j = (this.nspCounts[this.depth]++) << 1;
                this.nspStack = this.ensureCapacity(this.nspStack, j + 2);
                this.nspStack[j] = attrName;
                this.nspStack[j + 1] = this.attributes[i + 3];
                if (attrName != null && (this.attributes[i + 3] === ""))
                    this.error("illegal empty namespace");
                java.lang.System.arraycopy(this.attributes, i + 4, this.attributes, i, ((--this.attributeCount) << 2) - i);
                i -= 4;
            }
        }
        if (any) {
            for (var i = (this.attributeCount << 2) - 4; i >= 0; i -= 4) {
                var attrName = this.attributes[i + 2];
                var cut_2 = attrName.indexOf(':');
                if (cut_2 === 0 && !this.relaxed)
                    throw new Error("illegal attribute name: " + attrName + " at " + this);
                else if (cut_2 !== -1) {
                    var attrPrefix = attrName.substring(0, cut_2);
                    attrName = attrName.substring(cut_2 + 1);
                    var attrNs = this.getNamespace(attrPrefix);
                    if (attrNs == null && !this.relaxed)
                        throw new Error("Undefined Prefix: " + attrPrefix + " in " + this);
                    this.attributes[i] = attrNs;
                    this.attributes[i + 1] = attrPrefix;
                    this.attributes[i + 2] = attrName;
                }
            }
        }
        var cut = this.name.indexOf(':');
        if (cut === 0)
            this.error("illegal tag name: " + this.name);
        if (cut !== -1) {
            this.prefix = this.name.substring(0, cut);
            this.name = this.name.substring(cut + 1);
        }
        this.namespace = this.getNamespace(this.prefix);
        if (this.namespace == null) {
            if (this.prefix != null)
                this.error("undefined prefix: " + this.prefix);
            this.namespace = KXmlParser.NO_NAMESPACE;
        }
        return any;
    }

    ensureCapacity(arr, required) {
        return arr;
        //TODO see if this is needed
        //                    if (arr.length >= required)
        //                        return arr;
        //                    var bigger = new Array(required + 16);
        //                    java.lang.System.arraycopy(arr, 0, bigger, 0, arr.length);
        //                    return bigger;
    }

    error(desc) {
        if (this.relaxed) {
            if (this.__error == null)
                this.__error = "ERR: " + desc;
        }
        else
            this.exception(desc);
    }

    exception(desc) {
        throw (desc.length < 100 ? desc : desc.substring(0, 100) + "\n");
    }

    /**
        * common base for next and nextToken. Clears the state, except from txtPos and whitespace. Does not set the type variable
        */
    nextImpl() {
        if (this.currentFile == null)
            this.exception("No Input specified");
        if (this.type === KXmlParser.START_TAG && this.mFoundBinaryData) {
            this.skipToEndOfElementAfterBinaryData();
        }
        if (this.type === KXmlParser.END_TAG)
            this.depth--;
        while ((true)) {
            this.attributeCount = -1;
            if (this.degenerated) {
                this.degenerated = false;
                this.type = KXmlParser.END_TAG;
                return;
            }
            if (this.__error != null) {
                for (var i = 0; i < this.__error.length; i++)
                    this.push((this.__error.charAt(i)).charCodeAt(0));
                this.__error = null;
                this.type = KXmlParser.COMMENT;
                return;
            }
            if (this.relaxed && (this.stackMismatch > 0 || (this.peek(0) === -1 && this.depth > 0))) {
                var sp = (this.depth - 1) << 2;
                this.type = KXmlParser.END_TAG;
                this.namespace = this.elementStack[sp];
                this.prefix = this.elementStack[sp + 1];
                this.name = this.elementStack[sp + 2];
                if (this.stackMismatch !== 1)
                    this.__error = "missing end tag /" + this.name + " inserted";
                if (this.stackMismatch > 0)
                    this.stackMismatch--;
                return;
            }
            this.prefix = null;
            this.name = null;
            this.namespace = null;
            this.type = this.peekType();
            switch ((this.type)) {
                case KXmlParser.ENTITY_REF:
                    this.pushEntity();
                    return;
                case KXmlParser.START_TAG:
                    this.parseStartTag(false);
                    return;
                case KXmlParser.END_TAG:
                    this.parseEndTag();
                    return;
                case KXmlParser.END_DOCUMENT:
                    return;
                case KXmlParser.TEXT:
                    this.pushText(('<').charCodeAt(0), !this.token);
                    if (this.depth === 0) {
                        if (this.__isWhitespace)
                            this.type = KXmlParser.IGNORABLE_WHITESPACE;
                    }
                    return;
                default:
                    this.type = this.parseLegacy(this.token);
                    if (this.type !== KXmlParser.XML_DECL)
                        return;
            }
        }
    }

    parseLegacy(push) {
        var req = "";
        var term;
        var result;
        var prev = 0;
        this.read();
        var c = this.read();
        if (c === ('?').charCodeAt(0)) {
            if ((this.peek(0) === ('x').charCodeAt(0) || this.peek(0) === ('X').charCodeAt(0)) && (this.peek(1) === ('m').charCodeAt(0) || this.peek(1) === ('M').charCodeAt(0))) {
                if (push) {
                    this.push(this.peek(0));
                    this.push(this.peek(1));
                }
                this.read();
                this.read();
                if ((this.peek(0) === ('l').charCodeAt(0) || this.peek(0) === ('L').charCodeAt(0)) && this.peek(1) <= (' ').charCodeAt(0)) {
                    if (this.line !== 1 || this.column > 4)
                        this.error("PI must not start with xml");
                    this.parseStartTag(true);
                    if (this.attributeCount < 1 || !("version" === this.attributes[2]))
                        this.error("version expected");
                    this.version = this.attributes[3];
                    var pos = 1;
                    if (pos < this.attributeCount && ("encoding" === this.attributes[2 + 4])) {
                        this.encoding = this.attributes[3 + 4];
                        pos++;
                    }
                    if (pos < this.attributeCount && ("standalone" === this.attributes[4 * pos + 2])) {
                        var st = this.attributes[3 + 4 * pos];
                        if (("yes" === st))
                            this.standalone = true;
                        else if (("no" === st))
                            this.standalone = false;
                        else
                            this.error("illegal standalone value: " + st);
                        pos++;
                    }
                    if (pos !== this.attributeCount)
                        this.error("illegal xmldecl");
                    this.__isWhitespace = true;
                    this.txtPos = 0;
                    return KXmlParser.XML_DECL;
                }
            }
            term = ('?').charCodeAt(0);
            result = KXmlParser.PROCESSING_INSTRUCTION;
        }
        else if (c === ('!').charCodeAt(0)) {
            if (this.peek(0) === ('-').charCodeAt(0)) {
                result = KXmlParser.COMMENT;
                req = "--";
                term = ('-').charCodeAt(0);
            }
            else if (this.peek(0) === ('[').charCodeAt(0)) {
                result = KXmlParser.CDSECT;
                req = "[CDATA[";
                term = (']').charCodeAt(0);
                push = true;
            }
            else {
                result = KXmlParser.DOCDECL;
                req = "DOCTYPE";
                term = -1;
            }
        }
        else {
            this.error("illegal: <" + c);
            return KXmlParser.COMMENT;
        }
        for (var i = 0; i < req.length; i++)
            this.read(req.charAt(i));
        if (result === KXmlParser.DOCDECL)
            this.parseDoctype(push);
        else {
            while ((true)) {
                c = this.read();
                if (c === -1) {
                    this.error(KXmlParser.UNEXPECTED_EOF);
                    return KXmlParser.COMMENT;
                }
                if (push)
                    this.push(c);
                if ((term === ('?').charCodeAt(0) || c === term) && this.peek(0) === term && this.peek(1) === ('>').charCodeAt(0))
                    break;
                prev = c;
            }
            ;
            if (term === ('-').charCodeAt(0) && prev === ('-').charCodeAt(0))
                this.error("illegal comment delimiter: --->");
            this.read();
            this.read();
            if (push && term !== ('?').charCodeAt(0))
                this.txtPos--;
        }
        return result;
    }

    /**
        * precondition: &lt! consumed
        */
    parseDoctype(push) {
        var nesting = 1;
        var quoted = false;
        while ((true)) {
            var i = this.read();
            switch ((i)) {
                case -1:
                    this.error(KXmlParser.UNEXPECTED_EOF);
                    return;
                case ('\'').charCodeAt(0):
                    quoted = !quoted;
                    break;
                case ('<').charCodeAt(0):
                    if (!quoted)
                        nesting++;
                    break;
                case ('>').charCodeAt(0):
                    if (!quoted) {
                        if ((--nesting) === 0)
                            return;
                    }
                    break;
            }
            if (push)
                this.push(i);
        }
    }


    parseEndTag() {
        this.read();
        this.read();
        this.name = this.readName();
        this.skip();
        this.read('>');
        var sp = (this.depth - 1) << 2;
        if (this.depth === 0) {
            this.error("element stack empty");
            this.type = KXmlParser.COMMENT;
            return;
        }
        if (!(this.name === this.elementStack[sp + 3])) {
            this.error("expected: /" + this.elementStack[sp + 3] + " read: " + this.name);
            var probe = sp;
            while ((probe >= 0 && !(this.name.toLowerCase() === this.elementStack[probe + 3].toLowerCase()))) {
                this.stackMismatch++;
                probe -= 4;
            }
            ;
            if (probe < 0) {
                this.stackMismatch = 0;
                this.type = KXmlParser.COMMENT;
                return;
            }
        }
        this.namespace = this.elementStack[sp];
        this.prefix = this.elementStack[sp + 1];
        this.name = this.elementStack[sp + 2];
    }

    peekType() {
        switch ((this.peek(0))) {
            case -1:
                return KXmlParser.END_DOCUMENT;
            case ('&').charCodeAt(0):
                return KXmlParser.ENTITY_REF;
            case ('<').charCodeAt(0):
                switch ((this.peek(1))) {
                    case ('/').charCodeAt(0):
                        return KXmlParser.END_TAG;
                    case ('?').charCodeAt(0):
                    case ('!').charCodeAt(0):
                        return KXmlParser.LEGACY;
                    default:
                        return KXmlParser.START_TAG;
                }
            default:
                return KXmlParser.TEXT;
        }
    }

    get(pos) {
        return this.txtBuf.slice(pos, this.txtPos).join('');
    }

    push(c) {
        this.__isWhitespace = this.__isWhitespace && c <= (' ').charCodeAt(0);
        if (this.unicodeEmojiSupported && c >= 0x10000 && c <= 0x10ffff) {
            // A unicode emoji needs special treatment to be decoded back to a character
            this.txtBuf[this.txtPos++] = String.fromCodePoint(c);
        } else {
            this.txtBuf[this.txtPos++] = String.fromCharCode(c);
        }
    }

    /**
        * Sets name and attributes
        */
    parseStartTag(xmldecl) {
        this.mFoundBinaryData = false;
        if (!xmldecl)
            this.read();
        this.name = this.readName();
        this.attributeCount = 0;
        while ((true)) {
            this.skip();
            var c = this.peek(0);
            if (xmldecl) {
                if (c === ('?').charCodeAt(0)) {
                    this.read();
                    this.read('>');
                    return;
                }
            }
            else {
                if (c === ('/').charCodeAt(0)) {
                    this.degenerated = true;
                    this.read();
                    this.skip();
                    this.read('>');
                    break;
                }
                if (c === ('>').charCodeAt(0) && !xmldecl) {
                    this.read();
                    break;
                }
            }
            if (c === -1) {
                this.error(KXmlParser.UNEXPECTED_EOF);
                return;
            }
            var attrName = this.readName();
            if (attrName.length === 0) {
                this.error("attr name expected");
                break;
            }
            var i = (this.attributeCount++) << 2;
            this.attributes = this.ensureCapacity(this.attributes, i + 4);
            this.attributes[i++] = "";
            this.attributes[i++] = null;
            this.attributes[i++] = attrName;
            this.skip();
            if (this.peek(0) !== ('=').charCodeAt(0)) {
                this.error("Attr.value missing f. " + attrName);
                this.attributes[i] = "1";
            }
            else {
                this.read('=');
                this.skip();
                var delimiter = this.peek(0);
                if (delimiter !== ('\'').charCodeAt(0) && delimiter !== ('\"').charCodeAt(0)) {
                    this.error("attr value delimiter missing!");
                    delimiter = (' ').charCodeAt(0);
                }
                else
                    this.read();
                var p = this.txtPos;
                if ((attrName === "data") && (this.mIgnoreBinaryData || this.mDeferBinaryDataProcessing)) {
                    if (this.mIgnoreBinaryData) {
                        this.skipTo('\"');
                        this.attributes[i] = "";
                    }
                    else {
                        this.mFoundBinaryData = true;
                        this.attributes[i] = "";
                        this.degenerated = true;
                        break;
                    }
                }
                else {
                    this.pushText(delimiter, true);
                    this.attributes[i] = this.get(p);
                    this.txtPos = p;
                }
                if (delimiter !== (' ').charCodeAt(0))
                    this.read();
            }
        }

        var sp = this.depth++ << 2;
        this.elementStack = this.ensureCapacity(this.elementStack, sp + 4);
        this.elementStack[sp + 3] = this.name;
        //TODO see if this is needed
        //if (this.depth >= this.nspCounts.length) {
        //    var bigger = new Array(this.depth + 4);
        //    java.lang.System.arraycopy(this.nspCounts, 0, bigger, 0, this.nspCounts.length);
        //    this.nspCounts = bigger;
        //}
        this.nspCounts[this.depth] = this.nspCounts[this.depth - 1];
        if (this.processNsp)
            this.adjustNsp();
        else
            this.namespace = "";
        this.elementStack[sp] = this.namespace;
        this.elementStack[sp + 1] = this.prefix;
        this.elementStack[sp + 2] = this.name;
    }

    /**
        * result: isWhitespace; if the setName parameter is set, the name of the entity is stored in "name"
        */
    pushEntity() {
        this.push(this.read());
        var pos = this.txtPos;
        while ((true)) {
            var c = this.read();
            if (c === (';').charCodeAt(0))
                break;
            if (c < 128 && (c < ('0').charCodeAt(0) || c > ('9').charCodeAt(0)) && (c < ('a').charCodeAt(0) || c > ('z').charCodeAt(0)) && (c < ('A').charCodeAt(0) || c > ('Z').charCodeAt(0)) && c !== ('_').charCodeAt(0) && c !== ('-').charCodeAt(0) && c !== ('#').charCodeAt(0)) {
                if (!this.relaxed) {
                    this.error("unterminated entity ref");
                }
                if (c !== -1)
                    this.push(c);
                return;
            }
            this.push(c);
        }

        var code = this.get(pos);
        this.txtPos = pos - 1;
        if (this.token && this.type === KXmlParser.ENTITY_REF) {
            this.name = code;
        }
        if (code.charAt(0) === '#') {
            var c = (code.charAt(1) === 'x' ? parseInt(code.substring(2), 16) : parseInt(code.substring(1)));
            this.push(c);
            return;
        }
        var result = this.entityMap[code];
        this.unresolved = result == null;
        if (this.unresolved) {
            if (!this.token)
                this.error("unresolved: &" + code + ";");
        }
        else {
            for (var i = 0; i < result.length; i++)
                this.push((result.charAt(i)).charCodeAt(0));
        }
    }

    /**
        * types:
        * '<': parse to any token (for nextToken ())
        * '"': parse to quote
        * ' ': parse to whitespace or '>'
        */
    pushText(delimiter, resolveEntities) {
        var next = this.peek(0);
        var cbrCount = 0;
        while ((next !== -1 && next !== delimiter)) {
            if (delimiter === (' ').charCodeAt(0))
                if (next <= (' ').charCodeAt(0) || next === ('>').charCodeAt(0))
                    break;
            if (next === ('&').charCodeAt(0)) {
                if (!resolveEntities)
                    break;
                this.pushEntity();
            }
            else if (next === ('\n').charCodeAt(0) && this.type === KXmlParser.START_TAG) {
                this.read();
                this.push((' ').charCodeAt(0));
            }
            else
                this.push(this.read());
            if (next === ('>').charCodeAt(0) && cbrCount >= 2 && delimiter !== (']').charCodeAt(0))
                this.error("Illegal: ]]>");
            if (next === (']').charCodeAt(0))
                cbrCount++;
            else
                cbrCount = 0;
            next = this.peek(0);
        }
    }

    read(c) {
        var _this = this;
        if (((typeof c === 'string') || c === null)) {
            var __args = Array.prototype.slice.call(arguments);
            return (function () {
                var a = _this.read();
                if (a !== c)
                    _this.error("expected: \'" + c + "\' actual: \'" + (String.fromCharCode(a)) + "\'");
            })();
        }
        else if (c === undefined) {
            return this.read$();
        }
        else
            throw new Error('invalid overload');
    }

    read$() {
        var result;
        if (this.peekCount === 0)
            result = this.peek(0);
        else {
            result = this.__peek[0];
            this.__peek[0] = this.__peek[1];
        }
        this.peekCount--;
        this.column++;
        if (result === ('\n').charCodeAt(0)) {
            this.line++;
            this.column = 1;
        }
        return result;
    }

    /**
    *Reads from the the file.
    //TODO make this asynchronous as the FileReader API is asynchronous
    */
    readFromFile() {
        var readEndPosition = this.currentReadPosition + this.srcBufferSize;
        if (readEndPosition > this.contentSize) {
            readEndPosition = this.contentSize;
        }
        var blob = this.currentFile.slice(this.currentReadPosition, readEndPosition);
        var textRead = this.fileReader.readAsText(blob);
        this.srcBuf = textRead.split("");
        // the next line should ideally be adding textRead.length to the currentReadPosition
        // but the length can be incorrect in some cases (dunno why). Using the size that we requested
        // works better so we are using srcBufferSize now.
        this.currentReadPosition = this.currentReadPosition + this.srcBufferSize;
        return textRead.length;
    }

    /**
        * Does never read more than needed
        */
    peek(pos) {
        while ((pos >= this.peekCount)) {
            var nw = void 0;
            if (this.srcPos < this.srcCount)
                nw = (this.srcBuf[this.srcPos++]).charCodeAt(0);
            else {
                //this.srcCount = this.reader.read(this.srcBuf, 0, this.srcBuf.length);
                this.srcCount = this.readFromFile();
                if (this.srcCount <= 0)
                    nw = -1;
                else
                    nw = (this.srcBuf[0]).charCodeAt(0);
                this.srcPos = 1;
            }
            if (nw === ('\r').charCodeAt(0)) {
                this.wasCR = true;
                this.__peek[this.peekCount++] = ('\n').charCodeAt(0);
            }
            else {
                if (nw === ('\n').charCodeAt(0)) {
                    if (!this.wasCR)
                        this.__peek[this.peekCount++] = ('\n').charCodeAt(0);
                }
                else
                    this.__peek[this.peekCount++] = nw;
                this.wasCR = false;
            }
        }
        ;
        return this.__peek[pos];
    }

    readName() {
        var pos = this.txtPos;
        var c = this.peek(0);
        if ((c < ('a').charCodeAt(0) || c > ('z').charCodeAt(0)) && (c < ('A').charCodeAt(0) || c > ('Z').charCodeAt(0)) && c !== ('_').charCodeAt(0) && c !== (':').charCodeAt(0) && c < 192 && !this.relaxed)
            this.error("name expected");
        do {
            this.push(this.read());
            c = this.peek(0);
        } while (((c >= ('a').charCodeAt(0) && c <= ('z').charCodeAt(0)) || (c >= ('A').charCodeAt(0) && c <= ('Z').charCodeAt(0)) || (c >= ('0').charCodeAt(0) && c <= ('9').charCodeAt(0)) || c === ('_').charCodeAt(0) || c === ('-').charCodeAt(0) || c === (':').charCodeAt(0) || c === ('.').charCodeAt(0) || c >= 183));
        var result = this.get(pos);
        this.txtPos = pos;
        return result;
    }

    skip() {
        while ((true)) {
            var c = this.peek(0);
            if (c > (' ').charCodeAt(0) || c === -1)
                break;
            this.read();
        }
    }

    setInput(file) {
        this.fileReader = new FileReaderSync();
        this.currentFile = file;
        this.contentSize = file.size;
        this.currentReadPosition = 0;
        this.line = 1;
        this.column = 0;
        this.type = KXmlParser.START_DOCUMENT;
        this.name = null;
        this.namespace = null;
        this.degenerated = false;
        this.attributeCount = -1;
        this.encoding = null;
        this.version = null;
        this.standalone = null;
        if (file == null)
            return;
        this.srcPos = 0;
        this.srcCount = 0;
        this.peekCount = 0;
        this.depth = 0;
        this.entityMap = {};
        this.entityMap["amp"] = "&";
        this.entityMap["apos"] = "\'";
        this.entityMap["gt"] = ">";
        this.entityMap["lt"] = "<";
        this.entityMap["quot"] = "\"";
    }

    getFeature(feature) {
        if ((KXmlParser.FEATURE_PROCESS_NAMESPACES === feature))
            return this.processNsp;
        else if (this.isProp(feature, false, "relaxed"))
            return this.relaxed;
        else
            return false;
    }

    getInputEncoding() {
        return this.encoding;
    }

    defineEntityReplacementText(entity, value) {
        if (this.entityMap == null)
            throw new Error("entity replacement text must be defined after setInput!");
        this.entityMap[entity] = value;
    }

    getProperty(property) {
        if (this.isProp(property, true, "xmldecl-version"))
            return this.version;
        if (this.isProp(property, true, "xmldecl-standalone"))
            return this.standalone;
        if (this.isProp(property, true, "location"))
            return this.location != null ? this.location : this.currentFile.toString();
        return null;
    }

    getNamespaceCount(depth) {
        if (depth > this.depth)
            throw "java.lang.IndexOutOfBoundsException()";
        return this.nspCounts[depth];
    }

    getNamespacePrefix(pos) {
        return this.nspStack[pos << 1];
    }

    getNamespaceUri(pos) {
        return this.nspStack[(pos << 1) + 1];
    }

    getNamespace(prefix) {
        var _this = this;
        if (((typeof prefix === 'string') || prefix === null)) {
            var __args = Array.prototype.slice.call(arguments);
            return (function () {
                if (("xml" === prefix))
                    return "http://www.w3.org/XML/1998/namespace";
                if (("xmlns" === prefix))
                    return "http://www.w3.org/2000/xmlns/";
                for (var i = (_this.getNamespaceCount(_this.depth) << 1) - 2; i >= 0; i -= 2) {
                    if (prefix == null) {
                        if (_this.nspStack[i] == null)
                            return _this.nspStack[i + 1];
                    }
                    else if ((prefix === _this.nspStack[i]))
                        return _this.nspStack[i + 1];
                }
                return null;
            })();
        }
        else if (prefix === undefined) {
            return this.getNamespace$();
        }
        else
            throw new Error('invalid overload');
    }

    getDepth() {
        return this.depth;
    }

    getPositionDescription() {
        var buf = new java.lang.StringBuffer(this.type < KXmlParser.TYPES_$LI$().length ? KXmlParser.TYPES_$LI$()[this.type] : "unknown");
        buf.append(' ');
        if (this.type === KXmlParser.START_TAG || this.type === KXmlParser.END_TAG) {
            if (this.degenerated)
                buf.append("(empty) ");
            buf.append('<');
            if (this.type === KXmlParser.END_TAG)
                buf.append('/');
            if (this.prefix != null)
                buf.append("{" + this.namespace + "}" + this.prefix + ":");
            buf.append(this.name);
            var cnt = this.attributeCount << 2;
            for (var i = 0; i < cnt; i += 4) {
                buf.append(' ');
                if (this.attributes[i + 1] != null)
                    buf.append("{" + this.attributes[i] + "}" + this.attributes[i + 1] + ":");
                buf.append(this.attributes[i + 2] + "=\'" + this.attributes[i + 3] + "\'");
            }
            buf.append('>');
        }
        else if (this.type !== KXmlParser.IGNORABLE_WHITESPACE) {
            if (this.type !== KXmlParser.TEXT)
                buf.append(this.getText());
            else if (this.__isWhitespace)
                buf.append("(whitespace)");
            else {
                var text = this.getText();
                if (text.length > 16)
                    text = text.substring(0, 16) + "...";
                buf.append(text);
            }
        }
        buf.append("@" + this.line + ":" + this.column);
        if (this.location != null) {
            buf.append(" in ");
            buf.append(this.location);
        }
        else if (this.currentFile != null) {
            buf.append(" in ");
            buf.append(this.currentFile.toString());
        }
        return buf.toString();
    }

    getLineNumber() {
        return this.line;
    }

    getColumnNumber() {
        return this.column;
    }

    isWhitespace() {
        if (this.type !== KXmlParser.TEXT && this.type !== KXmlParser.IGNORABLE_WHITESPACE && this.type !== KXmlParser.CDSECT)
            this.exception(KXmlParser.ILLEGAL_TYPE);
        return this.__isWhitespace;
    }

    getText() {
        return this.type < KXmlParser.TEXT || (this.type === KXmlParser.ENTITY_REF && this.unresolved) ? null : this.get(0);
    }

    getTextCharacters(poslen) {
        if (this.type >= KXmlParser.TEXT) {
            if (this.type === KXmlParser.ENTITY_REF) {
                poslen[0] = 0;
                poslen[1] = this.name.length;
                return (this.name).split('');
            }
            poslen[0] = 0;
            poslen[1] = this.txtPos;
            return this.txtBuf;
        }
        poslen[0] = -1;
        poslen[1] = -1;
        return null;
    }

    getNamespace$() {
        return this.namespace;
    }

    getName() {
        return this.name;
    }

    getPrefix() {
        return this.prefix;
    }

    isEmptyElementTag() {
        if (this.type !== KXmlParser.START_TAG)
            this.exception(KXmlParser.ILLEGAL_TYPE);
        return this.degenerated;
    }

    getAttributeCount() {
        return this.attributeCount;
    }

    getAttributeType(index) {
        return "CDATA";
    }

    isAttributeDefault(index) {
        return false;
    }

    getAttributeNamespace(index) {
        if (index >= this.attributeCount)
            throw "java.lang.IndexOutOfBoundsException()";
        return this.attributes[index << 2];
    }

    getAttributeName(index) {
        if (index >= this.attributeCount)
            throw "java.lang.IndexOutOfBoundsException()";
        return this.attributes[(index << 2) + 2];
    }

    getAttributePrefix(index) {
        if (index >= this.attributeCount)
            throw "java.lang.IndexOutOfBoundsException()";
        return this.attributes[(index << 2) + 1];
    }

    getAttributeValue$int(index) {
        if (index >= this.attributeCount)
            throw "java.lang.IndexOutOfBoundsException()";
        return this.attributes[(index << 2) + 3];
    }

    getAttributeValue(namespace, name) {
        var _this = this;
        if (((typeof namespace === 'string') || namespace === null) && ((typeof name === 'string') || name === null)) {
            var __args = Array.prototype.slice.call(arguments);
            return (function () {
                for (var i = (_this.attributeCount << 2) - 4; i >= 0; i -= 4) {
                    if ((_this.attributes[i + 2] === name) && (namespace == null || (_this.attributes[i] === namespace)))
                        return _this.attributes[i + 3];
                }
                return null;
            })();
        }
        else if (((typeof namespace === 'number') || namespace === null) && name === undefined) {
            return this.getAttributeValue$int(namespace);
        }
        else
            throw new Error('invalid overload');
    }

    getEventType() {
        return this.type;
    }

    next() {
        this.txtPos = 0;
        this.__isWhitespace = true;
        var minType = 9999;
        this.token = false;
        do {
            this.nextImpl();
            if (this.type < minType)
                minType = this.type;
        } while ((minType > KXmlParser.ENTITY_REF || (minType >= KXmlParser.TEXT && this.peekType() >= KXmlParser.TEXT)));
        this.type = minType;
        if (this.type > KXmlParser.TEXT)
            this.type = KXmlParser.TEXT;
        return this.type;
    }

    nextToken() {
        this.__isWhitespace = true;
        this.txtPos = 0;
        this.token = true;
        this.nextImpl();
        return this.type;
    }

    nextTag() {
        this.next();
        if (this.type === KXmlParser.TEXT && this.__isWhitespace)
            this.next();
        if (this.type !== KXmlParser.END_TAG && this.type !== KXmlParser.START_TAG)
            this.exception("unexpected type");
        return this.type;
    }

    require(type, namespace, name) {
        if (type !== this.type || (namespace != null && !(namespace === this.getNamespace())) || (name != null && !(name === this.getName())))
            this.exception("expected: " + KXmlParser.TYPES_$LI$()[type] + " {" + namespace + "}" + name);
    }

    nextText() {
        if (this.type !== KXmlParser.START_TAG)
            this.exception("precondition: START_TAG");
        this.next();
        var result;
        if (this.type === KXmlParser.TEXT) {
            result = this.getText();
            this.next();
        }
        else
            result = "";
        if (this.type !== KXmlParser.END_TAG)
            this.exception("END_TAG expected");
        return result;
    }

    setFeature(feature, value) {
        if ((KXmlParser.FEATURE_PROCESS_NAMESPACES === feature))
            this.processNsp = value;
        else if (this.isProp(feature, false, "relaxed"))
            this.relaxed = value;
        else
            this.exception("unsupported feature: " + feature);
    }

    setProperty(property, value) {
        if (this.isProp(property, true, "location"))
            this.location = value;
        else
            throw ("unsupported property: " + property);
    }

    /**
        * Skip sub tree that is currently porser positioned on. <br>
        * NOTE: parser must be on START_TAG and when funtion returns parser will be positioned on corresponding END_TAG.
        */
    skipSubTree() {
        this.require(KXmlParser.START_TAG, null, null);
        var level = 1;
        while ((level > 0)) {
            var eventType = this.next();
            if (eventType === KXmlParser.END_TAG) {
                --level;
            }
            else if (eventType === KXmlParser.START_TAG) {
                ++level;
            }
        }
        ;
    }

    /**
        * Specifies if the binary data (in the attribute "data") should be ignored while reading
        * @param ignore true if should be ignored, false otherwise
        */
    setIgnoreBinaryData(ignore) {
        this.mIgnoreBinaryData = ignore;
    }

    /**
        * Specifies if the processing of the binary data (in the attribute "data") should be deferred
        * The data should then be read by calling readAndAppendBinaryDataToWriter method.
        * @param defer true if should be deferred, false otherwise
        */
    setDeferBinaryDataProcessing(defer) {
        this.mDeferBinaryDataProcessing = defer;
    }

    /**
        * Reads the binary data and appends it to the writer provided.
        * WARNING! This should only be used for reading/writing the binary data
        * with the DeferBinaryDataProcessing flag
        * @param writer the writer
        */
    readAndAppendBinaryDataToWriter(writer) {
        var buffer = new Array(KXmlParser.EXPORT_BUFFER_SIZE);
        var nextChar = this.read();
        var position = 0;
        while ((nextChar !== ('\"').charCodeAt(0) && nextChar !== -1)) {
            buffer[position] = String.fromCharCode(nextChar);
            position++;
            if (position === KXmlParser.EXPORT_BUFFER_SIZE) {
                writer.write(buffer);
                position = 0;
            }
            nextChar = this.read();
        }
        ;
        if (position > 0) {
            writer.write(buffer, 0, position);
        }
        writer.flush();
        this.skip();
        this.skipTo('/');
        this.skip();
        this.read('>');
        this.mFoundBinaryData = false;
    }

    /**
        * Reads the binary data and appends it to the stream provided.
        * WARNING! This should only be used for reading/writing the binary data
        * with the DeferBinaryDataProcessing flag
        * @throws IOException
        */
    readAndAppendBinaryDataToStream() {
        var nextChar = this.read();
        var buffer = new Array(KXmlParser.EXPORT_BUFFER_SIZE);
        var position = 0;
        while ((nextChar !== ('\"').charCodeAt(0) && nextChar !== -1)) {
            buffer[position] = String.fromCharCode(nextChar);
            position++;
            if (position === KXmlParser.EXPORT_BUFFER_SIZE) {
                //TODO update this posting as needed
                postMessage({ name: "BINARY_DATA", data: buffer.join('') });
                position = 0;
            }
            nextChar = this.read();
        }
        if (position > 0) {
            var newArray = buffer.splice(0, position);
            postMessage({ name: "BINARY_DATA", data: newArray.join('') });
        }
        this.skip();
        this.skipTo('/');
        this.skip();
        this.read('>');
        this.mFoundBinaryData = false;
    }

    readAndReturnBinaryData() {
        var nextChar = this.read();
        var buffer = new Array();
        var position = 0;
        while ((nextChar !== ('\"').charCodeAt(0) && nextChar !== -1)) {
            buffer[position] = String.fromCharCode(nextChar);
            position++;
            nextChar = this.read();
        }
        this.skip();
        this.skipTo('/');
        this.skip();
        this.read('>');
        this.mFoundBinaryData = false;
        return buffer.join('');
    }

    /**
        * Reads the binary data and posts that as a message
        * WARNING! This should only be used for reading/writing the binary data
        * with the DeferBinaryDataProcessing flag
        * @throws IOException
        */
    readAndSendBinaryDownloadDataToStream(contentType, messageIndex, partIndex, fileName) {
        var nextChar = this.read();
        var buffer = new Array();
        var position = 0;
        while ((nextChar !== ('\"').charCodeAt(0) && nextChar !== -1)) {
            buffer[position] = String.fromCharCode(nextChar);
            position++;
            nextChar = this.read();
        }
        if (position > 0) {
            var newArray = buffer.splice(0, position);
            postMessage({ name: "BINARY_DATA_DOWNLOAD", data: "data:" + contentType + ";base64," + newArray.join(''), file_name: fileName });
            postMessage({ name: "BINARY_DATA_DOWNLOAD_INITIATED", data: messageIndex + "_" + partIndex });
        }
    }

    /**
        * Skips to the end of the element after deferring the reading of binary data
        * @throws IOException
        */
    skipToEndOfElementAfterBinaryData() {
        this.skip();
        this.skipTo('\"');
        this.skipTo('/');
        this.skipTo('>');
        this.mFoundBinaryData = false;
    }

    /**
        * Skips till it can find the specified character or the end of the file
        * @param characterToFind the character to find
        * @throws IOException
        */
    skipTo(characterToFind) {
        var nextChar = this.read();
        while ((nextChar !== (characterToFind).charCodeAt(0) && nextChar !== -1)) {
            nextChar = this.read();
        }
    }
}

/**
* This constant represents the default namespace (empty string "")
*/
KXmlParser.NO_NAMESPACE = "";

/**
* Signalize that parser is at the very beginning of the document
* and nothing was read yet.
* This event type can only be observed by calling getEvent()
* before the first call to next(), nextToken, or nextTag()</a>).
*
* @see #next
* @see #nextToken
*/
KXmlParser.START_DOCUMENT = 0;

/**
* Logical end of the xml document. Returned from getEventType, next()
* and nextToken()
* when the end of the input document has been reached.
* <p><strong>NOTE:</strong> subsequent calls to
* <a href="#next()">next()</a> or <a href="#nextToken()">nextToken()</a>
* may result in exception being thrown.
*
* @see #next
* @see #nextToken
*/
KXmlParser.END_DOCUMENT = 1;

/**
* Returned from getEventType(),
* <a href="#next()">next()</a>, <a href="#nextToken()">nextToken()</a> when
* a start tag was read.
* The name of start tag is available from getName(), its namespace and prefix are
* available from getNamespace() and getPrefix()
* if <a href='#FEATURE_PROCESS_NAMESPACES'>namespaces are enabled</a>.
* See getAttribute* methods to retrieve element attributes.
* See getNamespace* methods to retrieve newly declared namespaces.
*
* @see #next
* @see #nextToken
* @see #getName
* @see #getPrefix
* @see #getNamespace
* @see #getAttributeCount
* @see #getDepth
* @see #getNamespaceCount
* @see #getNamespace
* @see #FEATURE_PROCESS_NAMESPACES
*/
KXmlParser.START_TAG = 2;

/**
* Returned from getEventType(), <a href="#next()">next()</a>, or
* <a href="#nextToken()">nextToken()</a> when an end tag was read.
* The name of start tag is available from getName(), its
* namespace and prefix are
* available from getNamespace() and getPrefix().
*
* @see #next
* @see #nextToken
* @see #getName
* @see #getPrefix
* @see #getNamespace
* @see #FEATURE_PROCESS_NAMESPACES
*/
KXmlParser.END_TAG = 3;

/**
* Character data was read and will is available by calling getText().
* <p><strong>Please note:</strong> <a href="#next()">next()</a> will
* accumulate multiple
* events into one TEXT event, skipping IGNORABLE_WHITESPACE,
* PROCESSING_INSTRUCTION and COMMENT events,
* In contrast, <a href="#nextToken()">nextToken()</a> will stop reading
* text when any other event is observed.
* Also, when the state was reached by calling next(), the text value will
* be normalized, whereas getText() will
* return unnormalized content in the case of nextToken(). This allows
* an exact roundtrip without changing line ends when examining low
* level events, whereas for high level applications the text is
* normalized appropriately.
*
* @see #next
* @see #nextToken
* @see #getText
*/
KXmlParser.TEXT = 4;

/**
* A CDATA sections was just read;
* this token is available only from calls to <a href="#nextToken()">nextToken()</a>.
* A call to next() will accumulate various text events into a single event
* of type TEXT. The text contained in the CDATA section is available
* by calling getText().
*
* @see #nextToken
* @see #getText
*/
KXmlParser.CDSECT = 5;

/**
* An entity reference was just read;
* this token is available from <a href="#nextToken()">nextToken()</a>
* only. The entity name is available by calling getName(). If available,
* the replacement text can be obtained by calling getText(); otherwise,
* the user is responsible for resolving the entity reference.
* This event type is never returned from next(); next() will
* accumulate the replacement text and other text
* events to a single TEXT event.
*
* @see #nextToken
* @see #getText
*/
KXmlParser.ENTITY_REF = 6;

/**
* Ignorable whitespace was just read.
* This token is available only from <a href="#nextToken()">nextToken()</a>).
* For non-validating
* parsers, this event is only reported by nextToken() when outside
* the root element.
* Validating parsers may be able to detect ignorable whitespace at
* other locations.
* The ignorable whitespace string is available by calling getText()
*
* <p><strong>NOTE:</strong> this is different from calling the
* isWhitespace() method, since text content
* may be whitespace but not ignorable.
*
* Ignorable whitespace is skipped by next() automatically; this event
* type is never returned from next().
*
* @see #nextToken
* @see #getText
*/
KXmlParser.IGNORABLE_WHITESPACE = 7;

/**
* An XML processing instruction declaration was just read. This
* event type is available only via <a href="#nextToken()">nextToken()</a>.
* getText() will return text that is inside the processing instruction.
* Calls to next() will skip processing instructions automatically.
* @see #nextToken
* @see #getText
*/
KXmlParser.PROCESSING_INSTRUCTION = 8;

/**
* An XML comment was just read. This event type is this token is
* available via <a href="#nextToken()">nextToken()</a> only;
* calls to next() will skip comments automatically.
* The content of the comment can be accessed using the getText()
* method.
*
* @see #nextToken
* @see #getText
*/
KXmlParser.COMMENT = 9;

/**
* An XML document type declaration was just read. This token is
* available from <a href="#nextToken()">nextToken()</a> only.
* The unparsed text inside the doctype is available via
* the getText() method.
*
* @see #nextToken
* @see #getText
*/
KXmlParser.DOCDECL = 10;

/**
* This feature determines whether the parser processes
* namespaces. As for all features, the default value is false.
* <p><strong>NOTE:</strong> The value can not be changed during
* parsing an must be set before parsing.
*
* @see #getFeature
* @see #setFeature
*/
KXmlParser.FEATURE_PROCESS_NAMESPACES = "http://xmlpull.org/v1/doc/features.html#process-namespaces";

/**
* This feature determines whether namespace attributes are
* exposed via the attribute access methods. Like all features,
* the default value is false. This feature cannot be changed
* during parsing.
*
* @see #getFeature
* @see #setFeature
*/
KXmlParser.FEATURE_REPORT_NAMESPACE_ATTRIBUTES = "http://xmlpull.org/v1/doc/features.html#report-namespace-prefixes";

/**
* This feature determines whether the document declaration
* is processed. If set to false,
* the DOCDECL event type is reported by nextToken()
* and ignored by next().
*
* If this feature is activated, then the document declaration
* must be processed by the parser.
*
* <p><strong>Please note:</strong> If the document type declaration
* was ignored, entity references may cause exceptions
* later in the parsing process.
* The default value of this feature is false. It cannot be changed
* during parsing.
*
* @see #getFeature
* @see #setFeature
*/
KXmlParser.FEATURE_PROCESS_DOCDECL = "http://xmlpull.org/v1/doc/features.html#process-docdecl";

/**
* If this feature is activated, all validation errors as
* defined in the XML 1.0 specification are reported.
* This implies that FEATURE_PROCESS_DOCDECL is true and both, the
* internal and external document type declaration will be processed.
* <p><strong>Please Note:</strong> This feature can not be changed
* during parsing. The default value is false.
*
* @see #getFeature
* @see #setFeature
*/
KXmlParser.FEATURE_VALIDATION = "http://xmlpull.org/v1/doc/features.html#validation";

KXmlParser.UNEXPECTED_EOF = "Unexpected EOF";

KXmlParser.ILLEGAL_TYPE = "Wrong event type";

KXmlParser.LEGACY = 999;

KXmlParser.XML_DECL = 998;

KXmlParser.EXPORT_BUFFER_SIZE = 2048;

