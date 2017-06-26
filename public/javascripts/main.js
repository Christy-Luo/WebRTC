/**
 加入聊天流程
 1.     房间其他某成员:接受到join房间的信息
 2.     房间其他某成员:发送 client_connect 连接邀请
 3.     加入者:接受到client_connect ,发送offer
 4.     房间其他某成员:加入offer信息 ,返回answer
 5.     加入者:添加answer信息


 重新建立点对点链接
 1.     用户A:ice状态为failed 而且身份为"offer" 或者 连接超时120左右
 1.     用户A:对用户B发送 reconnect_request请求,并断开对用户B已有的链接
 2.     用户B:断开对用户A的链接,并重新生成,发送client_connect
 3      用户A:发送offer并设置 (peerConnection)
 4.     用户B:加入offer信息 ,返回answer
 5.     用户A:加入answer信息

 这里的通信服务器我也没有重构了,有需要的可以重构一下,目前只能发room信息,信息中可以包含target来指定发给谁
 messageServer 需要重写以下函数就可以换message服务器了:
 sendRoomMessage
 createRoom
 quitRoom
 joinRoom
 getRooms

 ps:这里有个设计缺陷,就是我一开始设计只可以进入一个房间,所以设置了_room,有需要可以重构一下

 */
var appId = 'dte2vmww0m7lc4go2agxjdogibuzeu4i2nzlsd9bi866fxlv';
var appKey = 'm0lixg7wd07le1rjfdsatda8e8i9g3eka9i5lbdl4311gox4';
AV.init({appId, appKey});
var mainThread = Promise.resolve(), localStream, user, clientsEvent = new EventEmitter(), clients = {}, messageServer = {};
//初始化用户,暂时采用随机初始化
var initUser = Promise.resolve(user = {
    id: "U" + parseInt(Math.random() * 1000) + Date.now()
})
//主线程(流程)(promise) 初始化leancloud的实时通信 ,而且 阻塞主线程
var initMessageServer = (new Promise(function (resolve, reject) {
    (function InitAVClient() {
        realtime = new AV.Realtime({
            appId: appId
        });
        realtime.createIMClient(user.id).then(function (u) {
            console.log("创建client成功");
            resolve(u);
        }).catch(function () {
            console.log("链接通信服务器失败,1s秒后准备重新创建client");
            setTimeout(InitAVClient, 1000);
        });
    })();
})).then(function (AVClient) {
    //messageServer 接口实现
    messageServer.sendRoomMessage = function (message_object) {
        if (!messageServer._room) return;
        message_object.user = user.id;
        return messageServer._room.conversation.send(new AV.TextMessage(JSON.stringify(message_object)));

        //暂不采用延时发送
        // //这里采用messageThread 是因为leancloud的原因,要限制速率;目前限制为200ms发送一次
        // (function (message_object) {
        //     messageThread = new Promise(function (resolve, reject) {
        //         messageThread.then(function () {
        //             console.log("发送消息",message_object);
        //
        //         })
        //     });
        // })(message_object);

        //这里可以判断一下是否有target,如果有可以采用单点通信,但则这里默认流程为聊天室通信,减少demo复杂度
    };
    messageServer.addRoomToRemoteList = function () {
        //在房间时每 7 秒提交一次房间
        (function sendRoomInfo() {
            AV.Cloud.run('addRoom', {
                id: messageServer._room.id,
                name: messageServer._room.name,
                creator: messageServer._room.creator,
                number: Object.getOwnPropertyNames(clients).length
            }, {remote: true});
            setTimeout(function () {
                if (messageServer._room && messageServer._room.creator == user.id)  sendRoomInfo();
            }, 7000);
        })();
    };
    messageServer.removeRoomFromRemoteList = function () {
        if (messageServer._room.creator == user.id) {
            AV.Cloud.run('removeRoom', {id: messageServer._room.id}, {remote: true});
            //或者可以添加解散房间指令
        }
    };
    messageServer.createRoom = function (name) {
        return Promise.resolve().then(function () {
            if (messageServer._room)  return messageServer.quitRoom();
        }).then(function () {
            return AVClient.createConversation({
                name: name,
                transient: true,
            })
        }).then(function (conversation) {
            console.log(user.id + " 创建聊天室成功");
            messageServer._room = {
                name: name,
                id: conversation.id,
                creator: user.id,
                conversation: conversation,
                number: 1
            };
            messageServer.addRoomToRemoteList()
            return messageServer._room;
        }).catch(function () {
            console.log("创建聊天室失败!")
        });
    };
    messageServer.quitRoom = function () {
        console.log("主动退出房间:" + messageServer._room.id);
        return Promise.resolve().then(function () {
            if (!messageServer._room) return;
            messageServer._room.conversation.quit();
            messageServer.removeRoomFromRemoteList();
            messageServer._room = null;
        });
    };
    messageServer.joinRoom = function (room) {
        return Promise.resolve(room).then(function (room) {
            if (messageServer._room) return messageServer.quitRoom().then(function(){return room});
            return room;
        }).then(function (room) {
            return AVClient.getConversation(room.id).then(function (conversation) {
                return conversation.join()
            }).then(function(conversation){
                room.conversation = conversation;
                return room
            })
        }).then(function (room) {
            return messageServer._room = room;
        }).catch(function () {
            console.log("进入房间失败!");
        });
    }
    messageServer.getRooms = function(){
        return AV.Cloud.run('getRoomsAfterClear', {}, {
            remote: true,
        });
    };
    //绑定消息监听器,转发消息
    AVClient.on("message", function (message_text) {
        var message = JSON.parse(message_text.getText());
        clientsEvent.emit(message.action, message);
    });
});
//初始化视频设备
var initDevicers = new Promise(function (resolve, reject) {
    var videoThread = navigator.mediaDevices.getUserMedia({
        "audio": true,
        "video": true
    }).then(function (stream) {
        console.log("获取本地视频流成功");
        localStream = stream;
        stream.getTracks().map(function (track) {
            console.log("使用设备:" + track.kind + "\t\t" + track.label);
        });
        resolve()
    }, function (error) {
        console.log("获取本地视频失败");
        return Promise.resolve();
    });
});
//合并初始化操作到住流程
mainThread = mainThread.then(function () {
    return initUser;
}).then(function () {
    return initMessageServer
}).then(function () {
    return initDevicers;
})
//通信事件适配绑定 ,修改可以适应不同的通信服务器
mainThread = mainThread.then(function () {
});
//client事件处理
mainThread = mainThread.then(function () {
    console.log("开始绑定用户事件");
    //用户加入房间事件
    clientsEvent.on("join", function (message) {
        //因为才用了Vue,所以用vue设置对象,使其更新前端
        Vue.set(clients, message.user, utils.createClient(message.user, "no_offer"));
        console.log(message.user + ":发送connect指令完成,新建链接完成");
        Materialize.toast(message.user + ':加入房间', 4000);
        //发送连接请求
        messageServer.sendRoomMessage({
            action: "client_connect",
            target: message.user
        });
    });
    //退出房间事件
    clientsEvent.on("quit", function (message) {
        var client = clients[message.user];
        if (!client) return;
        console.log(message.user + ":退出房间");
        Materialize.toast(message.user + ':退出房间', 4000);
        utils.removeClient(client);
    });
    //对方请求连接事件
    clientsEvent.on("client_connect", function (message) {
        //因为才用群发所以判断是否发给自己
        if (message.target != user.id) return;
        console.log("接受到来自" + message.user + " client_connect");
        var client = utils.createClient(message.user, "no_answer");
        client.connectType = "offer";
        Vue.set(clients, client.id, client);
        //发送offer
        client.peer.createOffer({
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        }).then(function (dp) {
            client.peer.setLocalDescription(dp);
            messageServer.sendRoomMessage({
                action: "client_offer",
                target: client.id,
                sdp: dp
            });
        });
    });
    //对方发来offer事件  其实设计上还是可以建立client事件,这里简化了
    clientsEvent.on("client_offer", function (message) {
        var client = clients[message.user];
        if (!client || user.id != message.target) return;
        client.peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
        client.connectType = "answer";
        client.peer.createAnswer().then(function (dp) {
            console.log(client.id + ":收到offer,发送 answer");
            messageServer.sendRoomMessage({
                action: "client_answer",
                target: client.id,
                sdp: dp
            });
            client.peer.setLocalDescription(dp);

        }).catch(function () {
            console.log(client.id + ":生成 answer 失败")
            //todo 这里可以添加和对方断开链接
        });
    });
    //对方发来answer事件
    clientsEvent.on("client_answer", function (message) {
        var client = clients[message.user];
        if (!client || user.id != message.target) return;
        console.log(client.id + ":获取到它的answer");
        client.peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
        client.status = "has_answer";
    });
    //对方发来 icecandidate 事件
    clientsEvent.on("client_icecandidate", function (message) {
        var client = clients[message.user];
        if (!client || user.id != message.target) return;
        console.log("接受到对方的icecandidate", message.candidate)
        client.peer.addIceCandidate(new RTCIceCandidate(message.candidate));
    });
    //对方发来 client_reconnect_request事件
    clientsEvent.on("client_reconnect_request", function (message) {
        if (user.id != message.target) return;
        Materialize.toast(message.user + ':对方请求重新链接', 4000);
        Vue.set(clients, message.user, utils.createClient(message.user, "reconnecting"));
        messageServer.sendRoomMessage({
            action: "client_connect",
            target: message.user
        });
        console.log(message.user + ":开始重新链接,发送 client_connect 信号")
    });
    console.log("绑定用户事件完毕");
});
//封装部分操作为函数
var utils = {
    createClient: function (id, status) {
        utils.removeClient(clients[id]);
        var client = {
            id: id,
            status: status,
            createTime: new Date(),
            connectType: "no",
            reconnectTimer: null
        };
        client.peer = utils.createPeerConnection(client);
        return client;
    },
    createPeerConnection: function (client) {
        var peer = new RTCPeerConnection({
            "iceServers": [{
                "url": "stun:stun.l.google.com:19302"
            }]
        });

        //当获取到icecandidate  时,发送给对方client
        peer.onicecandidate = function (event) {
            if (!event.candidate) return;
            console.log("准备发送icecandidate",event.candidate);
            messageServer.sendRoomMessage({
                action: "client_icecandidate",
                target: client.id,
                candidate: event.candidate
            })

        };

        //获取到对方的stream
        peer.onaddstream = function (event) {
            Vue.set(client, "stream", event.stream);
        };

        //iceconnection状态改变事件
        peer.oniceconnectionstatechange = function () {
            console.log(client.id + " iceconnection状态改变:" + peer.iceConnectionState);
            switch (peer.iceConnectionState) {
                case "failed":
                    console.log("链接失败,本人位置:" + client.connectType, client.connectType == "offer");
                    Materialize.toast(client.id + ':链接失败,等待重试', 4000);
                    if (client.connectType == "offer")
                        utils.clientReconnect(client);
                    break;
                case"disconnected":
                    utils.clientReconnect(client);
                    break;
                case "checking":
                    client.status = "connecting";
                    client.reconnectTimer = setTimeout(function () {
                        console.log("ice connect连接超时,准备重新链接");
                        utils.clientReconnect(client);
                    }, 120000 + parseInt(Math.random() * 20000));
                    break;
                case "connected":
                    client.status = "connected";
                    clearTimeout(client.reconnectTimer);
                    Materialize.toast(client.id + ':连接成功', 4000);
                default:
                    clearTimeout(client.reconnectTimer);
            }
        };
        if (localStream) peer.addStream(localStream);
        return peer
    },
    removeClient: function (client) {
        if (!client) return;
        var peer = client.peer;
        client.status = "closing";
        if (!peer) return client.status = "closed";
        peer.onicecandidate = peer.onaddstream = peer.onconnectionstatechange = null;
        peer.ondatachannel = peer.oniceconnectionstatechange = peer.onidentityresult = null;
        peer.onidentityresult = peer.onidpassertionerror = peer.onidpvalidationerror = null;
        peer.onnegotiationneeded = peer.onpeeridentity = peer.onremovestream = null;
        peer.onsignalingstatechange = null;
        peer.close();
        client.status = "closed";
        client.peer = null;

        clearTimeout(client.reconnectTimer);
        Vue.delete(clients, client.id);

    },
    clientReconnect: function (client) {
        utils.removeClient(client);
        messageServer.sendRoomMessage({
            action: "client_reconnect_request",
            target: client.id
        })
    }
};