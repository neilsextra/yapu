/**
 * Constants
 * 
 */
var CHUNK_SIZE = 1024;

function chunkData(fileName, data) {
    var maxChunks = Math.floor(data.byteLength / CHUNK_SIZE)

    $('#waitMessage').text('Chunking Data : ' + data.byteLength);

    sendData(fileName, data, maxChunks).then(function(result) {

        $('#waitMessage').text('Committing Data : ' + data.byteLength);

        var parameters = {
            account: document.getElementById("cloud-account").value,
            token: document.getElementById("cloud-token").value,
            container: document.getElementById("cloud-container").value,
            directory: document.getElementById("current-directory").value,
            filename: result.file_name,
            filesize: data.byteLength
        };

        $.get('/commit', parameters, function(data) {

            $('#waitMessage').text('');

            var cloud = new Cloud();

            var account = document.getElementById("cloud-account").value;
            var token = document.getElementById("cloud-token").value;
            var container = document.getElementById("cloud-container").value;
            var directory = document.getElementById("current-directory").value;

            cloud.query(account, token, container, directory).then(result => {
                var paths = result.paths;

                generate_list_html(paths);

            });

            $('#waitDialog').css('display', 'none');

        });

    });

}

async function sendData(fileName, data, maxChunks) {
    var currentChunk = 0;
    var folder = "/";
    var offset = 0;

    for (var iChunk = 0, len = data.byteLength; iChunk < len; iChunk += CHUNK_SIZE) {
        var chunk = data.slice(iChunk, iChunk + CHUNK_SIZE);
        var result = await postData(folder, chunk, offset, currentChunk, maxChunks, fileName);

        offset += chunk.byteLength;

        console.log('Uploaded  - ' + currentChunk + "/" + maxChunks + ":" + chunk.byteLength);

        currentChunk += 1;

    }

    return {
        file_name: fileName
    };

}

function postData(folder, chunk, offset, currentChunk, maxChunks, fileName) {
    var content = null;

    try {
        content = new File([chunk], fileName);
    } catch (e) {
        content = new Blob([chunk], fileName);
    }

    var formData = new FormData();

    formData.append('account', document.getElementById("cloud-account").value);
    formData.append('token', document.getElementById("cloud-token").value);
    formData.append('container', document.getElementById("cloud-container").value);
    formData.append('directory', document.getElementById("current-directory").value);

    formData.append('filename', fileName);
    formData.append('offset', offset);
    formData.append('chunk', currentChunk);
    formData.append('size', chunk.byteLength);

    formData.append(fileName, content);

    return new Promise(resolve => {
        $.ajax({
            url: '/upload',
            type: 'POST',
            maxChunkSize: 10000,
            contentType: false,
            processData: false,
            async: true,
            data: formData,
            xhr: function() {
                var xhr = $.ajaxSettings.xhr();

                xhr.upload.addEventListener('progress', function(event) {
                    if (event.lengthComputable) {
                        var percentComplete = event.loaded / event.total;
                    }
                }, false);

                xhr.upload.addEventListener('load', function(event) {}, false);

                return xhr;

            },
            error: function(err) {
                console.log('Error: [' + err.status + '] - \'' + err.statusText + '\'');
                alert('Error: [' + err.status + '] - \'' + err.statusText + '\'');
                resolve(err);

            },
            success: function(result) {
                $('#waitMessage').text('Sending  - ' + currentChunk + "/" + maxChunks);

                resolve(result);

            }
        });

    });
}

function upload() {
    var loadButton = document.createElementNS("http://www.w3.org/1999/xhtml", "input");

    loadButton.setAttribute("type", "file");
    loadButton.multiple = true;
    loadButton.accept = `.csv`;

    loadButton.onchange = async function(event) {
        document.getElementById("waitDialog").style.display = "inline-block";


        var files = event.target.files;
        var filenames = [];

        for (var iFile = 0; iFile < files.length; ++iFile) {
            var reader = new FileReader();

            reader.onload = function() {
                var arrayBuffer = reader.result;

                console.log(`Chunking: ${files[0].name}`);
                chunkData(files[0].name, arrayBuffer);

            };

            reader.readAsArrayBuffer(files[0]);

        }

    };

    loadButton.click();

}

function connect() {


    $('#cloud-connect').css('display', 'inline-block');

}

function close_cloud_connection_panel() {
    $('#cloud-connect').css('display', 'none');

    return false;

}

function jump_to_file(position, filename) {

    $('#waitDialog').css('display', 'inline-block');

    var cloud = new Cloud();

    var account = document.getElementById("cloud-account").value;
    var token = document.getElementById("cloud-token").value;
    var container = document.getElementById("cloud-container").value;
    var directory = document.getElementById("current-directory").value;

    cloud.metadata(account, token, container, directory, filename).then(result => {
        let metadata = JSON.parse(result);
        let html = `<b style="font-size:12px; line-height:14px;">File Attributes</b>`;

        html += '<table style="line-height:18px;">';
        html += `<tr><td><b>File Name:</b></td><td>${metadata.name}</td></tr>`
        html += `<tr><td><b>Created Time:</b></td><td>${metadata.creation_time}</td></tr>`
        html += `<tr><td><b>Last Modified:</b></td><td>${metadata.last_modified}</td></tr>`
        html += `<tr><td><b>Size (bytes):</b></td><td>${metadata.size}</td></tr>`
        html += `</table>`;

        html += `<input type="hidden" id="filename" name="filename" value="${metadata.name}"></input>`;

        if (metadata.hasOwnProperty('metadata') && metadata['metadata'].hasOwnProperty('columns')) {

            html += `<p style="line-height:8px;">&nbsp;</p><b style="font-size:12px; line-height:14px;">Columns</b>`;
            html += `<table>`;

            let columns = metadata['metadata']['columns'];
            let entries = columns.replaceAll("[", "").replaceAll("]", "").replaceAll("'", "").split(",");

            for (let entry in entries) {

                html += `<tr><td><b>${parseInt(entry) + 1}</b></td><td>${entries[entry]}</td></tr>`

            }

            html += `<table>`;

        }

        $('#metadata').html(html);
        $('#metadata-buttons').css('display', 'inline-block')

        if (metadata.hasOwnProperty('metadata') && metadata['metadata'].hasOwnProperty('catalog')) {
            cloud.profile(account, token, container, directory, filename).then(result => {
                $('#display').css('display', 'inline-block');

                var report = document.getElementById('report');

                report = report.contentWindow || report.contentDocument.document || report.contentDocument;
                report.document.open();
                report.document.write(result);
                report.document.close();

                $('#waitDialog').css('display', 'none');

            });

        } else {
            var report = document.getElementById('report');

            report = report.contentWindow || report.contentDocument.document || report.contentDocument;

            let no_profile = `<html> ` +
                `<head> <meta charset = "UTF-8"> </head>` +
                `<body> ` +
                `<div style = "position: absolute; top: 0; bottom: 0; left: 0; right: 0;` +
                `display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap;">` +
                `<table>` +
                `<tr><td style='font-size:100px; text-align:center;'>&#9995;</td></tr>` +
                `<tr><td style='font-family: sans-serif;'>No Profile available for File</td></tr>` +
                `</table>` +
                `</div>` +
                `</body>` +
                `</html>`
            report.document.open();
            report.document.write(no_profile);
            report.document.close();

            $('#waitDialog').css('display', 'none');
        }

    });

}

function jump_to_directory(position, directory) {

    $('#waitDialog').css('display', 'inline-block');

    var cloud = new Cloud();

    var account = document.getElementById("cloud-account").value;
    var token = document.getElementById("cloud-token").value;
    var container = document.getElementById("cloud-container").value;

    var path = `/${directory}`.replaceAll("//", "/");

    cloud.query(account, token, container, path).then(result => {
        var paths = result.paths;

        generate_list_html(paths);

        $('#current-directory').val(path.replaceAll("//", "/"));
        $('#waitDialog').css('display', 'none');
        $('#metadata-buttons').css('display', 'none')

    });

}

function display_levelup_directory() {

    var paths = $('#current-directory').val().split('/');

    paths.pop();

    directory = '/' + paths.join('/').replaceAll('//', '/');
    var cloud = new Cloud();

    var account = document.getElementById("cloud-account").value;
    var token = document.getElementById("cloud-token").value;
    var container = document.getElementById("cloud-container").value;

    cloud.query(account, token, container, directory).then(result => {
        var paths = result.paths;

        generate_list_html(paths);

        $('#current-directory').val(directory.replaceAll('//', '/'));
        $('#waitDialog').css('display', 'none');
        $('#metadata-buttons').css('display', 'none')

    });

}

function generate_list_html(paths) {

    function generate_directory_html(position, directory) {
        var html = "";

        directory = directory.replaceAll('//', '/');

        html += `<li id="flist-${position}" style="display:block; cursor: default; height:22px; padding-left:4px; padding-top:4px;" onclick="jump_to_directory(${position}, '${directory}')">`;
        html += `<div class="fa fa-folder-o" style="color:black;"></div>`;
        html += `<label class="container" style="margin-left:2px; position:relative; text-align:bottom; top:1px; color:rgba(0,0,0,1.0);">`;
        html += directory.split('/').pop();
        html += `</label>`;
        html += `</li>`;

        return html;

    }

    function generate_file_html(position, filename) {
        var html = "";

        filename = filename.split('/').pop();

        html += `<li id="flist-${position}" style="display:block; cursor: default; height:22px; padding-left:4px; padding-top:4px;" onclick="jump_to_file(${position}, '${filename}')">`;
        html += `<div class="fa fa-file-text-o" style="color:black;"></div>`;
        html += `<label class="container" style="margin-left:2px; position:relative; text-align:bottom; top:1px; color:rgba(0,0,0,1.0);">`;
        html += filename;
        html += `</label>`;
        html += `</li>`;

        return html;

    }
    var paths_html = [];
    var files = [];
    var directories = [];

    for (var iPath = 0; iPath < paths.length; ++iPath) {

        var entry = paths[iPath];

        if (entry.path.endsWith(".csv")) {

            console.log(entry.path);

            files.push(entry.path);

        } else if (entry.is_directory == true) {

            if (entry.path.includes("@catalog")) {
                continue;
            } else if (entry.path.length == 1) {
                directories.push(entry.path);
            } else {
                directories.push("/" + entry.path);
            }

        }

    }

    paths_html.push('<ul>');

    for (var iDirectory = 0; iDirectory < directories.length; ++iDirectory) {
        paths_html.push(generate_directory_html(iDirectory, directories[iDirectory]));
    }

    for (var iFile = 0; iFile < files.length; ++iFile) {
        paths_html.push(generate_file_html(iFile, files[iFile]));
    }

    paths_html.push('</ul>');

    $('#files').html(paths_html.join(''));
    $('#files').css('display', 'inline-block')

}

$(function() {

    $('#current-directory').val("/")
    $('#cloud-connect').css('display', 'inline-block');

    $('#ok_cloud_connect_button').on('click', (e) => {
        var cloud = new Cloud();

        var account = document.getElementById("cloud-account").value;
        var token = document.getElementById("cloud-token").value;
        var container = document.getElementById("cloud-container").value;
        var directory = document.getElementById("current-directory").value;

        cloud.query(account, token, container, directory).then(result => {
            var paths = result.paths;

            generate_list_html(paths);
            $('#metadata-buttons').css('display', 'none');
            $('#cancel_cloud_connect_button').css('display', 'inline-block');
            $('#close').css('display', 'inline-block');


        });

        $('#cloud-connect').css('display', 'none');

        return false;

    });

    $('#cancel_cloud_connect_button').on('click', (e) => {

        $('#cloud-connect').css('display', 'none');

        return false;

    });

    $('#generate_profile').on('click', (e) => {
        $('#waitDialog').css('display', 'inline-block');
        var cloud = new Cloud();

        var account = document.getElementById("cloud-account").value;
        var token = document.getElementById("cloud-token").value;
        var container = document.getElementById("cloud-container").value;
        var filename = $('#filename').val().split('/').pop();

        cloud.regenerate(account, token, container, $('#current-directory').val(), filename).then(result => {
            $('#display').css('display', 'inline-block');

            var report = document.getElementById('report');

            report = report.contentWindow || report.contentDocument.document || report.contentDocument;
            report.document.open();
            report.document.write(result);
            report.document.close();

            $('#waitDialog').css('display', 'none');

        });

    });

    $('#download_profile').on('click', (e) => {
        var cloud = new Cloud();

        var account = document.getElementById("cloud-account").value;
        var token = document.getElementById("cloud-token").value;
        var container = document.getElementById("cloud-container").value;
        var filename = $('#filename').val().split('/').pop();

        cloud.download(account, token, container, $('#current-directory').val(), filename);

    });

});