let videoWidth, videoHeight;

let qvga = { width: { exact: 320 }, height: { exact: 240 } };

let vga = { width: { exact: 640 }, height: { exact: 480 } };

let resolution = window.innerWidth < 640 ? qvga : vga;

let placeholder = "loading..."
let previous_emotion = []
let previousframe = null

let stopId = null

// whether streaming video from the camera.
let streaming = false;

let video = document.getElementById('video');
let canvasOutput = document.getElementById('canvasOutput');
let canvasOutputCtx = canvasOutput.getContext('2d');
let stream = null;

// let detectFace = document.getElementById('face');
// let detectEye = document.getElementById('eye');

let info = document.getElementById('info');

function startCamera() {
    if (streaming) return;
    navigator.mediaDevices.getUserMedia({ video: resolution, audio: false })
        .then(function (s) {
            stream = s;
            video.srcObject = s;
            video.play();
        })
        .catch(function (err) {
            console.log("An error occured! " + err);
        });

    video.addEventListener("canplay", function (ev) {
        if (!streaming) {
            videoWidth = video.videoWidth;
            videoHeight = video.videoHeight;
            video.setAttribute("width", videoWidth);
            video.setAttribute("height", videoHeight);
            canvasOutput.width = videoWidth;
            canvasOutput.height = videoHeight;
            streaming = true;
        }
        startVideoProcessing();
    }, false);
}

let faceClassifier = null;
let eyeClassifier = null;

let src = null;
let dstC1 = null;
let dstC3 = null;
let dstC4 = null;

let canvasInput = null;
let canvasInputCtx = null;

let canvasBuffer = null;
let canvasBufferCtx = null;

function startVideoProcessing() {
    if (!streaming) { console.warn("Please startup your webcam"); return; }
    stopVideoProcessing();
    canvasInput = document.createElement('canvas');
    canvasInput.width = videoWidth;
    canvasInput.height = videoHeight;
    canvasInputCtx = canvasInput.getContext('2d');

    canvasBuffer = document.createElement('canvas');
    canvasBuffer.width = videoWidth;
    canvasBuffer.height = videoHeight;
    canvasBufferCtx = canvasBuffer.getContext('2d');

    srcMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC4);
    grayMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC1);

    faceClassifier = new cv.CascadeClassifier();
    faceClassifier.load('haarcascade_frontalface_default.xml');

    requestAnimationFrame(processVideo);
}

function processVideo() {
    canvasInputCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
    let imageData = canvasInputCtx.getImageData(0, 0, videoWidth, videoHeight);
    srcMat.data.set(imageData.data);
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
    let faces = [];
    let size;

    let faceVect = new cv.RectVector();
    let faceMat = new cv.Mat();
    cv.pyrDown(grayMat, faceMat);
    size = faceMat.size();
    faceClassifier.detectMultiScale(faceMat, faceVect);
    for (let i = 0; i < faceVect.size(); i++) {
        let face = faceVect.get(i);
        faces.push(new cv.Rect(face.x, face.y, face.width, face.height));
    }
    canvasOutputCtx.drawImage(canvasInput, 0, 0, videoWidth, videoHeight);
    drawResults(canvasOutputCtx, faces, 'red', size);
    stopId = requestAnimationFrame(processVideo);
}

function drawResults(ctx, results, color, size) {
    for (let i = 0; i < results.length; ++i) {
        let rect = results[i];
        let xRatio = videoWidth / size.width;
        let yRatio = videoHeight / size.height;
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.strokeRect(rect.x * xRatio, rect.y * yRatio, rect.width * xRatio, rect.height * yRatio);
        ctx.font = "30px Arial";
        if (previous_emotion[i] == null) {
            ctx.fillText(placeholder, (rect.x * xRatio) + 90, (rect.height * yRatio) + 100);
        } else {

            ctx.fillText(previous_emotion[i], (rect.x * xRatio) + 90, (rect.height * yRatio) + 100);
        }
        if (previousframe == null) {
            previousframe = ctx.getImageData(0, 0, videoWidth, videoHeight)
        } else {
            let compare_image = ctx.getImageData(0, 0, videoWidth, videoHeight)
            let result = diferentiateImages(previousframe, compare_image)
            if (result > 10) {
                previousframe = ctx.getImageData(0, 0, videoWidth, videoHeight)
                fetch('https://cors-anywhere.herokuapp.com/http://ec2-54-242-39-163.compute-1.amazonaws.com/buildframes/',
                    {
                        method: 'POST',
                        body: ctx.canvas.toDataURL('image/jpeg', 1.0).replace(/^data:image\/[a-z]+;base64,/, ""),
                        headers: {
                            'Access-Control-Allow-Methods': "GET,POST",
                            'Access-Control-Allow-Headers': "Content-Type,API-Key.",
                            'Access-Control-Allow-Origin': "*"
                        },
                        mode: 'cors'
                    }
                )
                    .then(res => res.text())
                    .then(body => {
                        console.log(body)
                        var obj = JSON.parse(body)
                        console.log(obj)

                        previous_emotion[i] = obj.emotions.toString()

                        // ctx.drawTextBox(frame, { x: 10, y: 10 }, [{ text: obj.emotions }], 0.4)
                    });
            }
        }
    }
}

function diferentiateImages(img1, img2) {
    if (img1.width !== img2.width || img1.height != img2.height) {
        callback(NaN);
        return;
    }

    var diff = 0;

    for (var i = 0; i < img1.data.length / 4; i++) {
        diff += Math.abs(img1.data[4 * i + 0] - img2.data[4 * i + 0]) / 255;
        diff += Math.abs(img1.data[4 * i + 1] - img2.data[4 * i + 1]) / 255;
        diff += Math.abs(img1.data[4 * i + 2] - img2.data[4 * i + 2]) / 255;
    }
    return (100 * diff / (img1.width * img1.height * 3));
}

function stopVideoProcessing() {
    if (src != null && !src.isDeleted()) src.delete();
    if (dstC1 != null && !dstC1.isDeleted()) dstC1.delete();
    if (dstC3 != null && !dstC3.isDeleted()) dstC3.delete();
    if (dstC4 != null && !dstC4.isDeleted()) dstC4.delete();
}

function stopCamera() {
    if (!streaming) return;
    stopVideoProcessing();
    document.getElementById("canvasOutput").getContext("2d").clearRect(0, 0, videoWidth, videoHeight);
    video.pause();
    video.srcObject = null;
    stream.getVideoTracks()[0].stop();
    streaming = false;
    cancelAnimationFrame(stopId)
}

function opencvIsReady() {
    console.log('OpenCV.js is ready');
    startCamera();
}