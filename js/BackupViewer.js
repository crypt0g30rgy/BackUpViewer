var conversationNavWidth = 0;
var viewerSortOrder = "Asc";
var viewerDateFormat = "L";
var worker;
var data = new Array();
var selectedConversation = "";
var progressBar;
var hasDigitsRegexp = /\d/;
var groupNameRegexp = new RegExp('~', 'g');
var currentFileContents = "";
var fileSize = 0;
var $filesLabel;
var $reloadLabel;
var selectedFiles = false;
var viewerLoadMedia = true;
var cachedRecords = [];
var disableCaching = false;
var filterTimer;

function loadFile() {
    moment.locale(window.navigator.userLanguage || window.navigator.language);
    setUserPreferences();
    document.getElementById('backupViewerRecordsList').innerHTML = "";
    document.getElementById('backupViewerConversations').innerHTML = "";

    if (selectedFiles.length != 1) {
        $filesLabel.text("Please select 1 XML Backup file").addClass("error");
        return;
    }
    if (selectedFiles[0].type != "text/xml") {
        $filesLabel.text("Only XML files are supported").addClass("error");
        return;
    }

    $filesLabel.text(selectedFiles[0].name).removeClass("error");
    $reloadLabel.removeClass("disabled");
    resetProgressBar();
    document.getElementById('backupViewerProgressBarContainerDiv').scrollIntoView(true);
    document.getElementById('backupViewerConversations').style.height = "95vh";
    document.getElementById('backupViewerRecordsList').style.height = "95vh";
    fileSize = selectedFiles[0].size;
    createWorker();

    cachedRecords = [];
    worker.postMessage({
        'cmd': disableCaching ? 'readAllConversations' : 'loadAllForCache',
        'files': selectedFiles,
        'sortOrder': viewerSortOrder,
        'loadMedia': viewerLoadMedia,
        'startDate': viewerDateStart,
        'endDate': viewerDateEnd,
    });
    gtag('event', 'ViewBackup-LoadFile', {
        'file_size': selectedFiles[0].size
    });
}

function showMedia(messageIndex, partIndex) {
    data = new Array();
    var mediaDiv = document.getElementById("mmsMedia_" + messageIndex + "_" + partIndex);
    mediaDiv.innerHTML = "<img src= 'img/loading.gif'/>";
    mediaDiv.style.visibility = "visible";
    document.getElementById("mmsMediaLink_" + messageIndex + "_" + partIndex).style.display = "none";
    createWorker();
    worker.postMessage({ 'cmd': 'readBinaryData', 'files': selectedFiles, 'messageIndex': messageIndex, 'partIndex': partIndex });
}

function printConversation() {
    var printWindow = window.open('', 'PRINT', 'height=400,width=600');
    printWindow.document.write('<html><head><title>' + document.title + '</title>');
    printWindow.document.write('<link rel="stylesheet" href="/css/StyleSheet.css" type="text/css" />');
    printWindow.document.write('</head><body >');
    printWindow.document.write('<h1>' + document.title + '</h1>');
    printWindow.document.write(document.getElementById("backupViewerRecordsList").innerHTML);
    printWindow.document.write('</body></html>');

    /* Delay the print event to make it work in Chrome */
    setInterval(function () {
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 1000);

    gtag('event', 'ViewBackup-Print' + currentFileContents, {});

    return true;
}

function selectConversation() {
    selectElementContents(document.getElementById("backupViewerRecordsListTable"));
}

function selectElementContents(el) {
    var body = document.body, range, sel;
    if (document.createRange && window.getSelection) {
        range = document.createRange();
        sel = window.getSelection();
        sel.removeAllRanges();
        try {
            range.selectNodeContents(el);
            sel.addRange(range);
        } catch (e) {
            range.selectNode(el);
            sel.addRange(range);
        }
    } else if (body.createTextRange) {
        range = body.createTextRange();
        range.moveToElementText(el);
        range.select();
    }
}

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

function loadRecords(contactNumber, contactName) {
    resetProgressBar();
    setUserPreferences()
    let dateRangeForDisplay = "";
    if (viewerDateStart) {
        if (viewerDateEnd) {
            dateRangeForDisplay = "<br/> between " + getDisplayDate(viewerDateStart) + " and " + getDisplayDate(viewerDateEnd);
        } else {
            dateRangeForDisplay = "<br/> after " + getDisplayDate(viewerDateStart);
        }
    } else if (viewerDateEnd) {
        dateRangeForDisplay = "<br/> before " + getDisplayDate(viewerDateEnd);
    }

    selectedConversation = (contactNumber ? "Conversation with " + contactName : contactName) +
        dateRangeForDisplay + 
        "<br/><span class='backupViewerNoPrint'><br/><a href='javascript:printConversation()'> Print </a> |" +
        " <a href='javascript:selectConversation()'>Select</a> |" +
        " <a href='javascript:downloadMedia(\"" + contactNumber + "\");'>Download All Media (beta) </a></span>";
    document.getElementById('backupViewerRecordsList').innerHTML = "";
    createWorker();
    worker.postMessage({
        'cmd': 'readAllRecords',
        'files': selectedFiles,
        'number': contactNumber,
        'sortOrder': viewerSortOrder,
        'loadMedia': viewerLoadMedia,
        'startDate': viewerDateStart,
        'endDate': viewerDateEnd,
    });
    document.getElementById('backupViewerProgressBarContainerDiv').scrollIntoView(true);
}

function loadRecordsFromCache(contactNumber, contactName) {
    resetProgressBar();
    setUserPreferences()
    let dateRangeForDisplay = "";
    if (viewerDateStart) {
        if (viewerDateEnd) {
            dateRangeForDisplay = "<br/> between " + getDisplayDate(viewerDateStart) + " and " + getDisplayDate(viewerDateEnd);
        } else {
            dateRangeForDisplay = "<br/> after " + getDisplayDate(viewerDateStart);
        }
    } else if (viewerDateEnd) {
        dateRangeForDisplay = "<br/> before " + getDisplayDate(viewerDateEnd);
    }

    selectedConversation = (contactNumber ? "Conversation with " + contactName : contactName) +
        dateRangeForDisplay +
        "<br/><span class='backupViewerNoPrint'><br/><a href='javascript:printConversation()'> Print </a> |" +
        " <a href='javascript:selectConversation()'>Select</a> |" +
        " <a href='javascript:downloadMedia(\"" + contactNumber + "\");'>Download All Media (beta) </a></span>";
    document.getElementById('backupViewerRecordsList').innerHTML = "";
    document.getElementById('backupViewerProgressBarContainerDiv').scrollIntoView(true);

    document.getElementById('backupViewerRecordsList').innerHTML =
        "<table style='border-spacing:0'>" +
        " <tr>" +
        "   <td class='backupViewerTableHeader'> " + selectedConversation + "</td>" +
        " </tr>" +
        " <tr>" +
        "  <td style='padding:0px'>" +
        "    <table class='backupViewerTable' id='backupViewerRecordsListTable'>" +
        "      <colgroup>" +
        "       <col style=\"width:80px\"/>" +
        "       <col style=\"width:190px\"/>" +
        "      </colgroup>" +
        "      <tr>" +
        "       <th>Type</th>" +
        "       <th>Date</th>" +
        "       <th>Name/Number</th>" +
        "       <th>" + (currentFileContents == "calls" ? "Call Duration" : "Message Body") + "</th>"
        "      </tr>" +
        "     </table>" +
        "  </td>" +
        " </tr > " +
        "</table>";

    var backupViewerRecordsListTable = document.getElementById("backupViewerRecordsListTable");

    // Get an array of filtered records to display and sort it
    var recordsToRender = [];
    for (var i = 0; i < cachedRecords.length; i++) {
        let record = cachedRecords[i];
        if (!contactNumber || (record.searchAddress == contactNumber)) {
            recordsToRender.push(record);
        }
    }

    if (viewerSortOrder == "Asc") {
        recordsToRender.sort(sortDate);
    } else {
        recordsToRender.sort(sortDateReverse);
    }

    // Update the UI in chunks to make sure its not locked up for too long at once.
    var counter = 0;
    var recordsRendered = 0;
    const recordCount = recordsToRender.length;
    const chunkSize = 1000;
    function displayInChunks() {
        var chunkCount = chunkSize;
        while (chunkCount-- && counter < recordCount) {
            let record = recordsToRender[counter];

            var row = backupViewerRecordsListTable.insertRow(-1);
            var cell0 = row.insertCell(0);
            cell0.innerHTML = record.type;
            var cell1 = row.insertCell(1);
            cell1.innerHTML = getDisplayDate(record.date);
            var cell2 = row.insertCell(2);
            cell2.classList.add("dont-break-out");
            cell2.innerHTML = getDisplayName(record.address, record.name);
            var cell3 = row.insertCell(3);
            cell3.classList.add("dont-break-out");
            cell3.innerHTML = record.content;
            recordsRendered++;
            counter++;
            updateProgressBar(recordsRendered, recordCount);
        }

        if (counter < recordCount) {
            // set Timeout for async iteration
            setTimeout(displayInChunks, 1);
        } else {
            // end of loop
            hideProgressBar();
        }
    }
    displayInChunks();
}

function downloadMedia(contactNumber) {
    resetProgressBar();
    setUserPreferences()
    createWorker();
    worker.postMessage({
        'cmd': 'loadAllMediaForDownload',
        'files': selectedFiles,
        'number': contactNumber,
        'startDate': viewerDateStart,
        'endDate': viewerDateEnd,
    });
    document.getElementById('backupViewerProgressBarContainerDiv').scrollIntoView(true);
}

function getDisplayName(contactNumber, contactName) {
    if (!contactNumber) {
        return contactName;
    }
    if (hasDigitsRegexp.test(contactNumber) && contactName != "(Unknown)" && contactName != "") {
        return contactName + " (" + contactNumber.replace(groupNameRegexp, ", ") + ")";
    }
    return contactNumber.replace(groupNameRegexp, ", ");
}

function getDisplayDate(date) {
    if (date && !isNaN(date)) {
        return moment(parseInt(date)).format(viewerDateFormat + " LTS");
    }
    return "";
}

function handleDateRadioChange() {
    if ($("#viewerAllDateRadio").is(':checked')) {
        $("#viewerDateStartInput").prop("disabled", true);
        $("#viewerDateEndInput").prop("disabled", true);
    } else {
        $("#viewerDateStartInput").prop("disabled", false);
        $("#viewerDateEndInput").prop("disabled", false);
    }
}

function resetProgressBar() {
    progressBar.style.width = '0%';
    document.getElementById("backupViewerProgressBarContainerDiv").style.visibility = "visible";
    document.getElementById("backupViewerProgressCount").innerText = "";
}

function hideProgressBar() {
    document.getElementById("backupViewerProgressBarContainerDiv").style.visibility = "hidden";
}

function updateProgressBar(current, total) {
    progressBar.style.width = Math.round((current / total) * 100) + '%';
    document.getElementById("backupViewerProgressCount").innerText = current;
}

function setUserPreferences() {
    const sortOrderSelect = document.getElementById("viewerSortOrder");
    viewerSortOrder = sortOrderSelect.options[sortOrderSelect.selectedIndex].value;

    const dateFormatSelect = document.getElementById("viewerDateFormat");
    const selectedFormat = dateFormatSelect.options[dateFormatSelect.selectedIndex].value;
    viewerDateFormat = selectedFormat ? selectedFormat : "L";

    viewerLoadMedia = document.getElementById("viewerLoadMediaCheckBox").checked;
    disableCaching = document.getElementById("viewerDisableCachingCheckBox").checked;

    if (document.getElementById("viewerAllDateRadio").checked) {
        viewerDateStart = null;
        viewerDateEnd = null;
    } else {
        let startDate = document.getElementById("viewerDateStartInput").valueAsDate;
        if (startDate) {
            let startDateTimeZoneOffset = startDate.getTimezoneOffset() * 60 * 1000; // minute to milliseconds
            viewerDateStart = startDate.getTime() + startDateTimeZoneOffset;
        } else {
            viewerDateStart = null;
        }
        let endDate = document.getElementById("viewerDateEndInput").valueAsDate;
        if (endDate) {
            let endDateTimeZoneOffset = endDate.getTimezoneOffset() * 60 * 1000; // minute to milliseconds
            viewerDateEnd = endDate.getTime() + endDateTimeZoneOffset + 86399000; // add 1 second less than 24 hours to get to the end of the day
        } else {
            viewerDateEnd = null;
        }
    }
}

function downloadContent(divId, fileName, contentType) {
    var container = document.getElementById(divId);
    var dataSource = contentType.indexOf("video") == 0 ? container.childNodes[0].childNodes[1].src : container.childNodes[0].src;
    download(dataSource, fileName == null || fileName == "null" ? "file" : fileName, contentType);
}

function collapseConversations() {
    conversationNavWidth = $("#backupViewerConversations").width(); 
    $("#backupViewerConversations").animate({
        width: '0%'
    }).hide();
    $("#backupViewerShowConversationsButton").show();
}

function expandConversations() {
    $("#backupViewerConversations").show()
        .animate({
            width: conversationNavWidth
        });
    $("#backupViewerShowConversationsButton").hide();
}

function handleFilterKeyUp() {
    if (filterTimer) {
        clearTimeout(filterTimer);
    }

    filterTimer = setTimeout(filterContacts, 400);
}

function filterContacts() {
    var filter = document.getElementById("backupViewerContactFilter").value.toUpperCase();
    console.log("filter executed for " + filter);
    var table = document.getElementById("backupViewerContacts");
    var rows = table.getElementsByTagName("tr");
    let foundMatch = false;

    // Loop through all table rows, and hide those who don't match the search query
    for (var i = 0; i < rows.length - 1; i++) { // exclude the last row as it has the "no match" message
        let link = rows[i].getElementsByTagName("a")[0];
        if (link) {
            let txtValue = link.text;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
                foundMatch = true;
            } else {
                rows[i].style.display = "none";
            }
        }
    }

    if (!foundMatch) {
        document.getElementById("backupViewerContactsNoMatch").style.display = "";
    } else {
        document.getElementById("backupViewerContactsNoMatch").style.display = "none";
    }
}

function createWorker() {
    if (worker) {
        worker.terminate();
    }

    worker = new Worker("js/KXmlParser.js");

    worker.onmessage = function (e) {
        if (typeof e.data.name !== 'undefined') {

            switch (e.data.name) {
                case "ADD_CACHE": {
                    cachedRecords.push(e.data.data);
                    break;
                }
                case "PROGRESS": {
                    updateProgressBar(e.data.current, e.data.total);
                    break;
                }
                case "FINISHED_BINARY": {
                    var mediaDiv = document.getElementById("mmsMedia_" + e.data.data.part_id);
                    mediaDiv.innerHTML = data.join('') + "<br/><a href='javascript:downloadContent(\"mmsMedia_" + e.data.data.part_id + "\",\"" + e.data.data.file_name + "\",\"" + e.data.data.content_type + "\");'>Download</a>";
                    mediaDiv.style.visibility = "visible";
                    worker.terminate();
                    break;
                }
                case "FINISHED_RECORDS": {
                    document.getElementById('backupViewerRecordsList').innerHTML =
                        "<table style='border-spacing:0'>" +
                        " <tr>" +
                        "   <td class='backupViewerTableHeader'> " + selectedConversation + "</td>" +
                        " </tr>" +
                        " <tr>" +
                        "  <td style='padding:0px'>" +
                        "    <table class='backupViewerTable' id='backupViewerRecordsListTable'>" +
                        "      <colgroup>" +
                        "       <col style=\"width:80px\"/>" +
                        "       <col style=\"width:190px\"/>" +
                        "      </colgroup>" +
                        "      <tr>" +
                        "       <th>Type</th>" +
                        "       <th>Date</th>" +
                        "       <th>Name/Number</th>" +
                        "       <th>" + (currentFileContents == "calls" ? "Call Duration" : "Message Body") + "</th>"
                        "      </tr>" +
                        "     </table>" +
                        "  </td>" +
                        " </tr > " +
                        "</table>";

                    var backupViewerRecordsListTable = document.getElementById("backupViewerRecordsListTable");
                    data = [];
                    var records = e.data.data;
                    for (var i = 0, iLen = records.length; i < iLen; i++) {
                        var record = records[i];
                        var row = backupViewerRecordsListTable.insertRow(-1);
                        var cell0 = row.insertCell(0);
                        cell0.innerHTML = record.type;
                        var cell1 = row.insertCell(1);
                        cell1.innerHTML = getDisplayDate(record.date);
                        var cell2 = row.insertCell(2);
                        cell2.classList.add("dont-break-out");
                        cell2.innerHTML = getDisplayName(record.number, record.name);
                        var cell3 = row.insertCell(3);
                        cell3.classList.add("dont-break-out");
                        cell3.innerHTML = record.content;
                    }
                    hideProgressBar();
                    worker.terminate();
                    break;
                }
                case "FINISHED_CONVERSATIONS": {
                    data = [];
                    data.push("<table class='backupViewerTable' id='backupViewerContacts'><tr><th class='backupViewerTH'>Select a conversation " +
                        "<div id='hideConversationsArrow' onclick='collapseConversations();'><img src='img/arrow-left.png' width='20' /></div>" +
                        "<br/><br/><input id=\"backupViewerContactFilter\" type=\"text\" placeholder=\"Filter by name or number\" onkeyup=\"handleFilterKeyUp();\" /></th></tr>");
                    var contacts = e.data.data.file_contacts;
                    var command = disableCaching ? "loadRecords" : "loadRecordsFromCache";
                    currentFileContents = e.data.data.file_contents;
                    var recordType = "";
                    if (currentFileContents == "calls") {
                        recordType = "call";
                    } else {
                        recordType = "message";
                    }

                    // Add the contacts list
                    for (var i = 0, iLen = contacts.length; i < iLen; i++) {
                        var contact = contacts[i];
                        var displayName = getDisplayName(contact.number, contact.name);
                        data.push("<tr><td><a href='#' onclick=\"" + command + "(\'" + escapeQuotes(contact.searchAddress) +
                            "\', \'" + escapeQuotes(displayName) + "\');event.preventDefault();\">" + displayName + "</a><br/>");
                        recordTypeToDisplay = recordType + (contact.count > 1 ? "s" : "");
                        data.push(contact.count + " " + recordTypeToDisplay + "<br/>");
                        if (contact.count == 1) {
                            data.push(getDisplayDate(contact.firstDate));
                        } else {
                            data.push(getDisplayDate(contact.firstDate) + " - " + getDisplayDate(contact.lastDate));
                        }
                        data.push("</td></tr>");
                    }

                    data.push("<tr id=\"backupViewerContactsNoMatch\" style=\"display:none;\"><td>There are no conversations matching the filter</td></tr>")
                    data.push("</table>");
                    document.getElementById('backupViewerConversations').innerHTML = data.join('');
                    hideProgressBar();
                    gtag('event', 'ViewBackup-LoadConversations', {
                        'conversation_count': contacts.length
                    });

                    worker.terminate();
                    break;
                }
                case "BINARY_DATA": {
                    data.push(e.data.data);
                    break;
                }
                case "BINARY_DATA_DOWNLOAD": {
                    download(e.data.data, e.data.file_name);
                    break;
                }
                case "BINARY_DATA_DOWNLOAD_INITIATED": {
                    var mediaDiv = document.getElementById("mmsMedia_" + e.data.data);
                    mediaDiv.innerHTML = "";
                    mediaDiv.style.visibility = "none";
                    document.getElementById("mmsMediaLink_" + e.data.data).style.display = "inline";
                    break;
                }
                case "FINISHED_ALL_MEDIA": {
                    document.getElementById("backupViewerProgressCount").innerText = "Zip file";
                    var records = e.data.data;
                    worker.terminate();

                    var zip = new JSZip();
                    for (var i = 0, iLen = records.length; i < iLen; i++) {
                        var record = records[i];
                        zip.file(record.name, record.content, { base64: true, date: new Date(parseInt(record.date)) });
                    }
                    zip.generateAsync({ type: "blob" }).then(function (zipContent) {
                        download(zipContent, "media.zip", "application/zip");
                        hideProgressBar();
                        gtag('event', 'ViewBackup-Download', {});
                    });       
                    break;
                }

                default: {
                    alert("Unknown Data");
                    break;
                }
            }
        } else {
            data.push(e.data);
        }
    };

    worker.onerror = function (e) {
        hideProgressBar();
        var viewerError = e.message +
            ' __ Line ' + e.lineno + ' in ' + e.filename +
            ' __ Platform: ' + navigator.platform +
            ' __ Size: ' + fileSize;

        var errorDetails = "There was an error processing the file. Please try again by reloading the page. If the issue persists, <a href='' target='_blank' onclick='document.getElementById(\"viewer-error-contact-form\").submit(); return false;'>Report this problem</a>.<br/><br/>" +
            'When reporting the problem, please copy & paste all the information below.<br/><br/>' +
            '================================<br/>' +
            'Error: ' + e.message + ",<br/> Line " + e.lineno + " in " + e.filename + "<br/>" +
            '================================<br/>';

        var finalMessage = "";

        if (navigator.userAgent.indexOf("Android") > 0) {
            finalMessage =
                "<strong>If you are trying to view a backup from Google Drive, please make sure you have downloaded the backup file locally on the phone and then select the file from the downloads folder.<br/>" +
                "Selecting a file directly from Google Drive will not work.<br/>" +
                "We recommend using the built-in viewer in SMS Backup & Restore for viewing the contents of the backup file.<br/> " +
                "To do so, open Menu > View backups in the app.</strong><br/><br/>";
            if (e.message.indexOf("NotReadableError") < 0) {
                finalMessage += errorDetails;
            }
        } else if (navigator.userAgent.indexOf("iPhone") > 0) {
            finalMessage =
                "<strong>If you are trying to view a backup from Google Drive, please make sure you have downloaded the file on the phone. " +
                "Opening a file directly from Google Drive will not work.</strong><br/>" + errorDetails;
        } else {
            finalMessage = errorDetails;
        }

        document.getElementById('backupViewerRecordsList').innerHTML = finalMessage;
        document.getElementById('viewer_logs').value = viewerError;
        worker.terminate();
        gtag('event', 'ViewBackup-Error', {
            'error_details': viewerError
        });
    };
}

function escapeQuotes(text) {
    if (!text) {
        return text;
    }
    return text.replace(/\'/g, "\\'").replace(/\"/g, '&quot;')
}

function hasClassSupport() {
    try {
        eval('"use strict"; class foo {}');
        return true;
    } catch (e) {
        return false;
    }
}

function initializeBackupViewer() {

    // Check for the various API support.
    if (window.File && window.FileReader && window.FileList && window.Blob && hasClassSupport()) {
        // Great success! All the APIs are supported.
        document.getElementById("backupViewerNotAvailable").style.display = "none";
    } else {
        document.getElementById("backupViewerAvailable").style.visibility = "hidden";
        document.getElementById("backupViewerNotAvailable").style.display = "visible";
    }
    progressBar = document.getElementById("backupViewerProgressBar");
    document.getElementById('files').addEventListener('change', function (e) {
        selectedFiles = e.target.files;
        loadFile();
    });

    var $form = $('.viewer-selection-box');
    $filesLabel = $('#viewerFileLabel');
    $reloadLabel = $('#reloadLabel')
    $form.on('drag dragstart dragend dragover dragenter dragleave drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
    }).on('dragover dragenter', function () {
        $form.addClass('is-dragover');
    }).on('dragleave dragend drop', function () {
        $form.removeClass('is-dragover');
    }).on('drop', function (e) {
        selectedFiles = e.originalEvent.dataTransfer.files;
        loadFile();
    });

}